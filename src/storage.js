'use strict';
/**
 * Файловое хранилище. Сейчас — диск сервера (DATA_DIR/files).
 * Интерфейс put/stream/remove одинаков, чтобы позже подключить S3-совместимое хранилище без правки API.
 * Имя файла от пользователя на диске не используется: только случайный ключ.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');
const { HttpError } = require('./http');

function createDiskStorage(root) {
  fs.mkdirSync(root, { recursive: true });
  const fileOf = (key) => {
    if (!/^[a-f0-9]{2}\/[a-f0-9]{32}$/.test(key)) throw new Error('bad storage key');
    return path.join(root, key);
  };
  return {
    /** Сохраняет поток, ограничивая размер. Возвращает { key, size, sha256 }. */
    async put(readable, maxBytes) {
      const id = crypto.randomBytes(16).toString('hex');
      const key = id.slice(0, 2) + '/' + id;
      const file = fileOf(key);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const hash = crypto.createHash('sha256');
      let size = 0;
      const meter = new Transform({
        transform(chunk, _enc, cb) {
          size += chunk.length;
          if (size > maxBytes) return cb(new HttpError(413, `Файл больше ${Math.round(maxBytes / 1048576)} МБ`, 'too_large'));
          hash.update(chunk);
          cb(null, chunk);
        }
      });
      try {
        await pipeline(readable, meter, fs.createWriteStream(file, { flags: 'wx' }));
      } catch (e) {
        fs.rmSync(file, { force: true });
        throw e;
      }
      if (size === 0) { fs.rmSync(file, { force: true }); throw new HttpError(400, 'Пустой файл', 'empty'); }
      return { key, size, sha256: hash.digest('hex') };
    },
    stream(key) { return fs.createReadStream(fileOf(key)); },
    exists(key) { return fs.existsSync(fileOf(key)); },
    remove(key) { fs.rmSync(fileOf(key), { force: true }); }
  };
}

module.exports = { createDiskStorage };
