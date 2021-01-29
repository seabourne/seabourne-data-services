/**
 */

/* globals jest: false, beforeAll: false, beforeEach: false, describe: false, it: false, expect: false */

'use strict'

import stream, {Readable, Writable} from 'stream'

import { getMockReq, getMockRes } from '@jest-mock/express'

function getEventedMockReq(options) {
  let req = getMockReq(options)
  req.addListener = req.on = (eventName, listener) => {
    let listeners = req.__listeners || (req.__listeners = {}),
        eventListeners = listeners[eventName] || (listeners[eventName] = [])
    eventListeners.push(listener)
  }
  req.emit = (eventName, ...args) => {
    let eventListeners = req.__listeners && req.__listeners[eventName]
    if (eventListeners) {
      for (let listener of eventListeners)
        listener(...args)
    }
    return !!(eventListeners && (eventListeners.length > 0))
  }
  return req
}

function getWritableMockRes() {
  let ctx = getMockRes() // {res, next, clearMockRes}
  // sigh; @jest-mock/express doesn't mock response as Writable
  let writable = ctx.writable = new WriteMemory()
  for (let key of ['emit', 'end', 'on', 'once', 'removeListener', 'write'])
    ctx.res[key] = writable[key].bind(writable)
  ctx.res.writeHead = (statusCode, ...args) => {
    let statusMessage = (typeof args[0] === 'string') ? args.shift() : 'OK',
        headers = args.shift() || {}
    ctx.res.write(`HTTP/1.1 ${statusCode} ${statusMessage}\n`)
    for (let key in headers)
      ctx.res.write(`${key}: ${headers[key]}\n`)
    ctx.res.write('\n')
  }
  ctx.res.flush = jest.fn(() => {})
  // groan; @jest-mock/express doesn't mock socket
  ctx.res.socket = {setTimeout: jest.fn((mills) => {}) }
  return ctx
}

import {StreamedDataService, NDJSONEncodeStream, DataStatusService} from '../dist/index.js'

class WriteMemory extends Writable {
  constructor(options) {
    super(options)
    this.reset()
  }

  _write(chunk, _, next) {
    this.buffer.push(chunk.toString())
    next()
  }

  clear() {
    let buf = this.buffer
    this.buffer = []
    return buf
  }

  reset() {
    this.buffer = []
    this.finished = new Promise((resolve, reject) => {
      let cleanup = stream.finished(this, {}, (err) => {
        if (err) reject(err); else resolve()
        cleanup()
      })
    })
  }
}


const clientId = 'whatever'

const testEntityType = 'test'
const testTimestamps = {
  [testEntityType]: expect.any(Number),
  [testEntityType + '-dep']: expect.any(Number) }

const statusResponseData = {
  entityType: testEntityType,
  superseded: testTimestamps }


const dateRE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{1,2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,})?Z$/

const responseCreatedAt = '2021-01-01T00:00:00.00Z'
const responseObjects = {
  '1': {
    _id: expect.any(String),
    what: 'ever',
    createdAt: expect.stringMatching(dateRE),
    updatedAt: expect.stringMatching(dateRE) }
}

const responseHeader = {
  count: expect.any(Number),
  errors: [],
  update: false
}

function responseData(objects, keyProp) {
  const updatedAt = new Date()
  return Readable.from((function* () {
    for (let [key, obj] of Object.entries(objects)) {
      obj = {...obj, createdAt: responseCreatedAt, updatedAt}
      if (keyProp) obj[keyProp] = key
      yield obj
    }
  })())
}

const statusLineRE = /^HTTP\/1.1 ([0-9]+) (.*)\n$/
const headerLineRE = /^([a-zA-Z0-9-]+): (.*)\n$/
const dataLineRE = /^data: (.*)\n$/

function expectHeader(statusCode, chunks) {
  let headers = {}, line = chunks.shift(), m
  m = statusLineRE.exec(line),
  expect(m).not.toBeNull()
  expect(parseInt(m[1])).toEqual(statusCode)
  while (chunks.length > 0) {
    line = chunks.shift()
    if (line === '\n') break
    expect(line).toMatch(headerLineRE)
    m = headerLineRE.exec(line)
    headers[m[1]] = m[2]
  }
  expect(line).toEqual('\n')
  return headers
}

function normalizeChunks(chunks) {
  const lfRE = /\n\n$/
  for (let i = chunks.length - 1; i >= 0; i -= 1) {
    while (lfRE.test(chunks[i])) {
      chunks.splice(i + 1, 0, '\n')
      chunks[i] = chunks[i].substring(0, chunks[i].length - 1)
    }
  }
  return chunks
}


jest.setTimeout(1 * 60 * 1000)

describe('StreamedDataService class', () => {
  let mockRequest, mockResponseContext, mockResponse
  let service

  beforeAll(() => {
    mockRequest = getMockReq()
    mockResponseContext = getWritableMockRes()
    mockResponse = mockResponseContext.res
    service = new StreamedDataService({
      key: NDJSONEncodeStream.makeKeyFn('_id', 'test'),
      async getData(req) {
        let header = {count: Object.keys(responseObjects).length}
        return [header, responseData(responseObjects, '_id')]
      }
    })
  })

  describe('load', () => {
    it('should instantiate', () => {
      expect(service).not.toBeNull()
    })
  })

  describe('send data', () => {
    it('should send NDJSON stream to response', async () => {
      await service.serve(mockRequest, mockResponse)
      let writable = mockResponseContext.writable
      await writable.finished
      let chunks = writable.clear(),
          headers = expectHeader(200, chunks)
      expect(chunks.length).toEqual(Object.keys(responseObjects).length + 1)
      expect(JSON.parse(chunks[0])).toEqual(responseHeader)
      for (let i = 1; i < chunks.length; i += 1) {
        let row = JSON.parse(chunks[i]),
            key = row[0].split('.')
        expect(key[0]).toEqual('test')
        expect(row[1]).toEqual(responseObjects[key[1]])
      }
    })
  })

})

describe('DataStatusService class', () => {
  let mockRequest, mockResponseContext, mockResponse
  let service

  beforeAll(() => {
debugger;
    mockRequest = getEventedMockReq({sessionID: clientId})
    mockResponseContext = getWritableMockRes()
    mockResponse = mockResponseContext.res
    service = new DataStatusService({eventPrefix: 'service-path'})
  })

  describe('load', () => {
    it('should instantiate', () => {
      expect(service).not.toBeNull()
    })
    it('should initialize server context', () => {
      service.statusServer(mockRequest, mockResponse)
      let writable = mockResponseContext.writable
      let chunks = writable.clear(),
          headers = expectHeader(200, chunks)
      expect(chunks[0]).toEqual('\n')
    })
    it('should register entity types', () => {
      let times = Object.keys(testTimestamps).reduce((acc, key) => { acc[key] = 0; return acc }, {})
      service.registerEntityType(clientId, 'test', times)
    })
  })

  describe('send status', () => {
    it('should send status in response to bulk timestamp change', async () => {
      let now = Date.now(),
          times = Object.keys(testTimestamps).reduce((acc, key) => { acc[key] = now; return acc }, {})
      service.recordTimestampChanges(times)
      await new Promise((resolve, reject) => { setTimeout(resolve, 0) })
      let writable = mockResponseContext.writable
      let chunks = normalizeChunks(writable.clear())
      expect(chunks.length).toEqual(4)
      expect(chunks[0]).toEqual('event: service-path/test\n')
      expect(chunks[1]).toMatch(/id: [0-9]+\n/)
      expect(chunks[2]).toMatch(dataLineRE)
      expect(chunks[3]).toEqual('\n')
      let m = dataLineRE.exec(chunks[2]),
          t = JSON.parse(m[1])
      expect(t).toEqual(statusResponseData)
    })
    it('should send status in response to individual timestamp changes', async () => {
      let now = Date.now()
      for (let name in testTimestamps)
        service.recordTimestampChanges({[name]: now})
      await new Promise((resolve, reject) => { setTimeout(resolve, 0) })
      let writable = mockResponseContext.writable
      let chunks = normalizeChunks(writable.clear())
      expect(chunks.length).toEqual(4)
      expect(chunks[0]).toEqual('event: service-path/test\n')
      expect(chunks[1]).toMatch(/id: [0-9]+\n/)
      expect(chunks[2]).toMatch(dataLineRE)
      expect(chunks[3]).toEqual('\n')
      let m = dataLineRE.exec(chunks[2]),
          t = JSON.parse(m[1])
      expect(t).toEqual(statusResponseData)
    })
  })

  describe('close', () => {
    it('should handle close event', () => {
      mockRequest.emit('close', {})
    })
  })

})
