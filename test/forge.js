var test = require('tape')
var fs = require('fs')
var path = require('path')
var memdb = require('memdb')
var hyperdrive = require('hyperdrive')
var hyperlog = require('hyperlog')
var concat = require('concat-stream')
var pkgdb = require('../')

test('reject forged update', function (t) {
  t.plan(14)
  var hash1, hash2, pkg1
  var pkg0 = pkgdb({
    drive: hyperdrive(memdb()),
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    db: memdb()
  })
  pkg0.getLink(function (err, key) {
    pkg1 = pkgdb({
      key: key,
      drive: hyperdrive(memdb()),
      log: hyperlog(memdb(), { valueEncoding: 'json' }),
      db: memdb()
    })
    writev1(function (err, h1) {
      t.error(err)
      hash1 = h1
      writev2(function (err, h2) {
        t.error(err)
        hash2 = h2
        forgeHistory(function (err) {
          sync(checkFiles)
        })
      })
    })
  })

  function writev1 (cb) {
    var pub = pkg0.publish('1.0.0')
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
    var pub = pkg0.publish('1.0.1')
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
  function forgeHistory (cb) {
    var archive = pkg0.archive
    var pending = 1
    archive.createFileWriteStream('1.0.0/hello.txt')
      .once('finish', done)
      .end('UPDATED')
    function done () {
      if (--pending === 0) cb()
    }
  }
  function sync (cb) {
    var r0 = pkg0.replicate()
    var r1 = pkg1.replicate()

    var pending = 2
    r0.once('stream-close', function (key) {
      t.equal(key, 'log')
      if (--pending === 0) cb()
    })
    r1.once('stream-close', function (key) {
      t.equal(key, 'log')
      if (--pending === 0) cb()
    })
    r0.pipe(r1).pipe(r0)
  }
  function checkFiles () {
    var v1 = pkg1.checkout('1.0.0')
    v1.list({ live: false }, function (err, files) {
      t.error(err)
      t.deepEqual(files.map(fname), [ 'hello.txt', 'what.txt' ])
    })
    v1.createFileReadStream('hello.txt').pipe(verify('hi'))
    v1.createFileReadStream('what.txt').pipe(verify('cool'))

    var v2 = pkg1.checkout('1.0.1')
    v2.list({ live: false }, function (err, files) {
      t.error(err)
      t.deepEqual(files.map(fname), [ 'hello.txt', 'index.html' ])
    })
    v2.createFileReadStream('hello.txt').pipe(verify('HI'))
    v2.createFileReadStream('index.html').pipe(verify('<h1>what</h1>'))

    pkg1.versions(function (err, versions) {
      t.error(err)
      t.deepEqual(versions.map(vprops), [
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

    function verify (str) {
      return concat({ encoding: 'string' }, function (body) {
        t.equal(body, str)
      })
    }
  }
})

function fname (x) { return x.name }
function vprops (v) {
  return {
    version: v.version,
    block: v.block,
    hash: v.hash
  }
}
