var hyperdrive = require('hyperdrive')
var hprefix = require('hyperdrive-prefix')
var sub = require('subleveldown')
var mutexify = require('mutexify')
var Package = require('./lib/pkg.js')

var INFO = 'i', DRIVE = 'd'

module.exports = function (db, opts) {
  var link = null
  var lock = mutexify()
  var idb = sub(db, INFO)
  var drive = hyperdrive(sub(db, DRIVE))

  var pkg = new Package(function (version) {
    var cursor = hprefix(version)
    getArchive(function (archive) {
      cursor.setArchive(archive)
    })
    return cursor
  })
  return pkg

  function getArchive (fn) {
    if (link) return process.nextTick(function () {
      fn(drive.createArchive(link, { live: true }))
    })
    lock(function (release) {
      idb.get('link', function (err, ilink) {
        if (err && !notFound(err)) {
          pkg.emit('error', err)
          return release()
        } else if (ilink) {
          link = Buffer(ilink, 'hex')
          fn(drive.createArchive(link, { live: true }))
          return release()
        }
        var archive = drive.createArchive(undefined, { live: true })
        var ws = archive.createFileWriteStream('versions.json')
        ws.once('finish', function () {
          link = archive.key
          idb.put('link', link.toString('hex'), function (err) {
            if (err) return pkg.emit('error', err)
            fn(drive.createArchive(archive.key, { live: true }))
            release()
          })
        })
        ws.end('[]\n')
      })
    })
  }
}

function notFound (err) {
  return err && (/^notfound/i.test(err) || err.notFound)
}
