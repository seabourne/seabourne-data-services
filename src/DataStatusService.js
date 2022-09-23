'use strict'

/** Data Status Service.
 * Provides an `EventSource` service that delivers data entity status
 * events that inform the client of changes to server data.
 *
 * Configuration for use:
 * *   The `statusServer()` method needs to be assigned as the handler
 *     for the `EventSource` route. For example:
 *         ```
 *         router.route('get', this.eventPrefix + '/status', statusService.statusServer)
 *         ```
 * *   Timestamp changes need to be reported to the
 *     `recordTimestampChanges()` method. For example:
 *         ```
 *         timestamps.on('timestamp-changed', (timestamp) => {
 *           statusService.recordTimestampChanges({[timestamp.name]: timestamp.time})
 *         })
 *         ```
 *
 * @param {Object} options - configuration options:
 * *   `eventPrefix` **<string>** prefix for `EventSource` event names
 */
class DataStatusService {

  constructor(options) {
    this._config = {eventPrefix: '', ...options}
    this._statusId = 0
    this._statusClients = {}
  }

  get eventPrefix() { return this._config.eventPrefix }

  /** Registers status events for specified entity type.
   * No-op if events are already registered for entity type. The
   * timestamps in the `times` parameter restrict which timestamps
   * indicate changes for the entity type. (Other timestamps passed to
   * `recordTimestampChanges()` don't affect the entity type.) The
   * timestamp times in the `times` parameter may be zero-valued
   * placeholders.
   * @param {string} clientId client id; conventionally, a session id
   * @param {string} entityType entity type; conventionally, consists
   *   of an entity name, possibly followed by a context identifier,
   *   separated by a colon (e.g. `supplier:<project-id>`)
   * @param {Object} times - associative array of timestamps;
   *   indexed by timestamp name, values are timestamp times
   */
  registerEntityType(clientId, entityType, times) {
    let clientState = this._getClientState(clientId)
    if (!clientState.res)
      console.log(`Registering ${entityType} entity type, no socket for client ${clientId}`)
    if (!clientState.entityStates[entityType])
      clientState.entityStates[entityType] = {entityType, times: {...times}}
  }

  /** Records timestamp changes.
   * @param {Object} superseded - associative array of timestamps;
   *   indexed by timestamp name, values are timestamp times
   */
  recordTimestampChanges(superseded) {
    for (let clientId in this._statusClients) {
      let clientState = this._getClientState(clientId)
      for (let entityType in clientState.entityStates)
        this._updateTimestamps(clientId, entityType, superseded)
    }
  }

  /** Bound data entity status server method.
   * (`EventSource` route handler; expects `(request, response)` parameters.)
   */
  get statusServer() {
    return this.__statusServer || (this.__statusServer = this._statusServer.bind(this))
  }
  _statusServer(req, res) {
    let clientId = req.sessionID,
        clientState = this._getClientState(clientId)

    if (clientState.closeHandler) {
      console.log(`Entity status request from ${clientId}, request already active`)
      req.removeListener('close', clientState.closeHandler)
    }

    clientState.res = res
    clientState.closeHandler = (e) => {
      let clientState = this._getClientState(clientId)
      delete clientState.res
      delete clientState.closeHandler
      // TO DO: should we reset `entityStates`, too?
    }
    req.addListener('close', clientState.closeHandler)

    res.socket.setTimeout(0) // somebody seems to be setting a 2-minute timeout by default
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive' })
    res.write('\n')
  }

  _getClientState(clientId) {
    return this._statusClients[clientId] || (this._statusClients[clientId] = {clientId, entityStates: {}})
  }

  _updateTimestamps(clientId, entityType, superseded) {
    let clientState = this._getClientState(clientId),
        entityState = clientState.entityStates[entityType] || (clientState.entityStates[entityType] = {entityType, times: {}})
    for (let name in superseded) {
      if (entityState.times.hasOwnProperty(name)) {
        if (superseded[name] > entityState.times[name]) {
          if (!entityState.superseded) entityState.superseded = {}
          entityState.superseded[name] = superseded[name]
        }
      }
    }
    if (entityState.superseded && !entityState.timeoutId)
      entityState.timeoutId = setTimeout(() => {
        delete entityState.timeoutId
        this._statusChange(clientId, entityType)
      }, 0)
  }

  _statusChange(clientId, entityType) {
    let clientState = this._getClientState(clientId)
    if (clientState.res) {
      let entityState = clientState.entityStates[entityType],
          superseded = entityState.superseded
      if (superseded) {
        let res = clientState.res,
            event = `${this.eventPrefix}/${entityType}`,
            data = {entityType, superseded}
        Object.assign(entityState.times, superseded)
        delete entityState.superseded
        this._statusId += 1
        res.write(`event: ${event}\n`)
        res.write(`id: ${this._statusId}\n`)
        res.write(`data: ${JSON.stringify(data)}\n\n`)
        res.flush() // needed because of compression middleware
      }
    }
  }



}

export {DataStatusService as default}
