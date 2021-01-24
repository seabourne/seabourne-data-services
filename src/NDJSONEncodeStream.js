'use strict'

import {Transform} from 'stream'

/** Transform stream to perform NDJSON-encoding.
 *
 * The stream accepts as input a sequence of objects, and emits
 * NDJSON-encoded output.
 *
 * For each object, it constructs a two-element array consisting of the
 * object key and the object itself, then JSON-encodes the array.
 *
 * @param {Object} options - configuration options
 * *   `key` **Function** - key access function
 * *   `prefixes` **Array** - array of objects to be NDJSON-encoded and
 *     emitted before the main sequence of objects
 * *   `suffixes` **Array** - array of objects to be NDJSON-encoded and
 *     emitted after the main sequence of objects
 */
class NDJSONEncodeStream extends Transform {

  constructor(options) {
    super({readableObjectMode: false, writableObjectMode: true})
    this.config = {prefixes: [], suffixes: [], ...options}
    for (let obj of this.config.prefixes)
      this.push(this._stringify(obj))
  }

  _transform(obj, encoding, callback) {
    let row = [this.config.key(obj), obj]
    callback(null, this._stringify(row))
  }

  _flush(callback) {
    for (let obj of this.config.suffixes)
      this.push(this._stringify(obj))
    callback(null)
  }

  _stringify(obj) {
    return JSON.stringify(obj) + '\n'
  }

  /** Makes a key access function.
   * Given an object, the key access function returns an object key.
   * @param {string} prop - name of object property to be used as key
   * @param {string} prefix - prefix to be prepended to key
   * @return {Function} key access function
   */
  static makeKeyFn(prop, prefix) {
    return (obj) => {
      let key = obj[prop]
      if (prefix) key = prefix + '.' + key
      return key
    }
  }

}

export {NDJSONEncodeStream as default}
