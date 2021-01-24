'use strict'

import NDJSONEncodeStream from './NDJSONEncodeStream.js'

/** Streamed data service.
 * Data service that delivers data as an NDJSON-encoded stream.
 *
 * @param {Object} options - configuration options:
 * *   `getData` **<Function>** implementation for the service
 *     `_getData()` method
 * *   `key` **<Function|string>** data entity key access function;
 *     or, if a string is specified, the name of the data entity
 *     property to be used as the key
 */
class StreamedDataService {

  constructor (options) {
    this._config = {key: '_id', ...options}
    if (this._config.getData) this._getData = this._config.getData
    if (this._config.key)
      this._makeKey = (typeof this._config.key === 'function') ?
        this._config.key : NDJSONEncodeStream.makeKeyFn(this._config.key)
  }

  /** Gets data to serve request.
   * @param {Request} request - request context
   * @return {Array} two-element array consisting of a header object and
   *   a readable stream that delivers the data entities
   */
  async _getData(request) {
  }

  /** Gets key from data entity.
   * @param {Object} obj - data entity
   * @return {string} key
   */
  _makeKey(obj) {
  }

  get serve() { return this._serve.bind(this) }
  async _serve(req, res) {
    let [header, entities] = await this._getData(req)
    header = {count: -1, update: false, errors: [], ...header}

    const ndjsonEncode = new NDJSONEncodeStream({key: this._makeKey, prefixes: [header]})

    res.writeHead(200, {'Content-Type': 'application/x-ndjson' })
    entities.pipe(ndjsonEncode)
    ndjsonEncode.pipe(res)
  }

  static service(options) {
    let service = new StreamedDataService(options)
    return service.serve
  }

}

export {StreamedDataService as default}
