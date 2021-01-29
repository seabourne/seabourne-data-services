'use strict'

import morph from 'morph'

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

  /** Picks params from request.
   * For a GET request, retrieves parameters from the query object;
   * for a POST request, from the request body. In either case,
   * converts parameter names to camel-case.
   *
   * Note: This method has landed here for want of any obviously better
   * place to put it. It's handy for an API that allows requests to be
   * submitted with a GET method (with request parameters specified as
   * query parameters) or with a POST method (with request parameters
   * specified in the request body).
   *
   * @param {Object} req - request object
   * @return {Object} parameters
   */
  static pickParams(req) {
    let params = {}
    switch (req.method) {
    case 'GET':
      for (let key in req.query) {
        let prop = morph.toCamel(key)
        params[prop] = req.query[key]
      }
      break
    case 'POST':
      for (let key in req.body) {
        let prop = morph.toCamel(key)
        params[prop] = req.body[key]
      }
      break
    default:
      throw new Error(`Data request ${req.method} method is not allowed.`)
    }
    return params
  }

}

export {StreamedDataService as default}
