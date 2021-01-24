/**
 */

/* globals jest: false, beforeAll: false, beforeEach: false, describe: false, it: false, expect: false */

'use strict'

import stream, {Readable, Writable} from 'stream'

import { getMockReq, getMockRes } from '@jest-mock/express'

import {StreamedDataService, NDJSONEncodeStream} from '../dist/index.js'

class WriteMemory extends Writable {
  constructor(options) {
    super(options)
    this.reset()
  }

  _write(chunk, _, next) {
    this.buffer.push(chunk.toString())
    next()
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

let mockRequest, mockResponseContext, mockResponse


beforeAll(() => {
debugger;
  mockRequest = getMockReq()
  mockResponseContext = getMockRes() // {res, next, clearMockRes}
  // sigh; @jest-mock/express doesn't mock response as Writable
  let writable = mockResponseContext.writable = new WriteMemory(),
      res = mockResponse = mockResponseContext.res
  for (let key of ['emit', 'end', 'on', 'once', 'removeListener', 'write'])
    res[key] = writable[key].bind(writable)
})

jest.setTimeout(1 * 60 * 1000)

describe('StreamedDataService class', () => {
  let service

  beforeAll(() => {
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
    it('should send NDJSON stream to response', async () => {
      await service.serve(mockRequest, mockResponse)
      let writable = mockResponseContext.writable
      await writable.finished
      let chunks = writable.buffer
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
