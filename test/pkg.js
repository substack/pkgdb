var test = require('tape')
var fs = require('fs')
var path = require('path')
var memdb = require('memdb')
var hyperdrive = require('hyperdrive')
var hyperlog = require('hyperlog')
var concat = require('concat-stream')
var pkgdb = require('../')

test('publishing', function (t) {
  t.plan(14)
  var pkg = pkgdb({
    drive: hyperdrive(memdb()),
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    db: memdb()
  })
  writev1(function (err, hash1) {
    t.error(err)
    pkg.versions(function (err, versions) {
      t.error(err)
      t.deepEqual(versions, [
        {
          version: '1.0.0',
          hash: hash1,
          block: 2
        }
      ], 'version list 1')
    })
    writev2(function (err, hash2) {
      t.error(err)
      pkg.versions(function (err, versions) {
        t.error(err)
        t.deepEqual(versions, [
          {
            version: '1.0.0',
            hash: hash1,
            block: 2
          },
          {
            version: '1.0.1',
            hash: hash2,
            block: 4
          }
        ], 'version list 2')
      })
      checkFiles()
    })
  })

  function writev1 (cb) {
    var pub = pkg.publish('1.0.0')
    var pending = 2
    pub.createFileWriteStream('hello.txt')
      .once('finish', done)
      .end('hi')
    pub.createFileWriteStream('what.txt')
      .once('finish', done)
      .end('cool')
    function done () {
      if (--pending === 0) pub.commit(cb)
    }
  }
  function writev2 (cb) {
    var pub = pkg.publish('1.0.1')
    var pending = 2
    pub.createFileWriteStream('hello.txt')
      .once('finish', done)
      .end('HI')
    pub.createFileWriteStream('index.html')
      .once('finish', done)
      .end('<h1>what</h1>')
    function done () {
      if (--pending === 0) pub.commit(cb)
    }
  }
  function checkFiles () {
    var v1 = pkg.checkout('1.0.0')
    v1.list({ live: false }, function (err, files) {
      t.error(err)
      t.deepEqual(files, [ 'hello.txt', 'what.txt' ])
    })
    v1.createFileReadStream('hello.txt').pipe(verify('hi'))
    v1.createFileReadStream('what.txt').pipe(verify('cool'))
    
    var v2 = pkg.checkout('1.0.1')
    v2.list({ live: false }, function (err, files) {
      t.error(err)
      t.deepEqual(files, [ 'hello.txt', 'index.html' ])
    })
    v2.createFileReadStream('hello.txt').pipe(verify('HI'))
    v2.createFileReadStream('index.html').pipe(verify('<h1>what</h1>'))

    function verify (str) {
      return concat({ encoding: 'string' }, function (body) {
        t.equal(body, str)
      })
    }
  }
})
