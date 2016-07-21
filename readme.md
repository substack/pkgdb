# pkgdb

p2p database for versioned directories

* fewer bytes over the wire with rabin fingerprinting
* clients can share payloads with each other
* re-use the same swarm for updates

depends on: https://github.com/mafintosh/hyperdrive/pull/89

# example

``` js
#!/usr/bin/env node
var fs = require('fs')
var path = require('path')
var minimist = require('minimist')
var level = require('level')
var glob = require('glob')
var hyperdrive = require('hyperdrive')
var hyperlog = require('hyperlog')
var sub = require('subleveldown')
var pkgdb = require('pkgdb')

var argv = minimist(process.argv.slice(2))
var db = level('.pkgdb')

var pkg = pkgdb({
  drive: hyperdrive(sub(db, 'd')),
  log: hyperlog(sub(db, 'l'), { valueEncoding: 'json' }),
  db: sub(db, 'i')
})

if (argv._[0] === 'publish') {
  var version = argv._[1]
  var pub = pkg.publish(version)
  var g = glob('**', {
    ignore: [ '.pkgdb/**', '.git/**', 'node_modules/**' ],
    nodir: true
  })
  var pending = 1
  g.on('match', function (m) {
    pending++
    fs.createReadStream(m)
      .pipe(pub.createFileWriteStream(m))
      .once('finish', done)
  })
  g.once('end', done)

  function done () {
    if (--pending !== 0) return
    pub.commit(function (err, hash) {
      if (err) error(err)
      else console.log(version, hash)
    })
  }
} else if (argv._[0] === 'versions') {
  var version = argv._[1]
  pkg.versions(function (err, versions) {
    if (err) return error(err)
    versions.forEach(function (v) {
      console.log(v.version, v.hash)
    })
  })
} else if (argv._[0] === 'files') {
  var version = argv._[1]
  pkg.checkout(version).list({ live: false }, function (err, files) {
    if (err) return error(err)
    files.forEach(function (entry) { console.log(entry.name) })
  })
} else if (argv._[0] === 'read') {
  var version = argv._[1]
  var file = argv._[2]
  pkg.checkout(version).createFileReadStream(file)
    .pipe(process.stdout)
}

function error (err) {
  console.error(err.toString())
  process.exit(1)
}
```

# api

``` js
var pkgdb = require('pkgdb')
```

## var pkg = pkgdb(opts)

Create a new pkgdb instance from:

* `opts.db` - leveldb instance for persistent storage
* `opts.drive` - [hyperdrive][1]
* `opts.log` - [hyperlog][2] instance

[1]: https://github.com/mafintosh/hyperdrive
[2]: https://github.com/mafintosh/hyperlog

## pkg.versions(cb)

Get a list of the versions as `cb(err, versions)`.

Each version `v` in the `versions` array has:

* `v.version` - semver version string
* `v.hash` - hexadecimal hash of the version content
* `v.block` - integer block of the hyperdrive sequence at that hash

## var archive = pkg.checkout(version)

Return the [hyperdrive][1] archive rooted in the semver string `version`
directory. The archive is read-only.

## var archive = archive.publish(version)

Return a new empty [hyperdrive][1] archive rooted in the semver string `version`
directory for writing new version content.

## archive.commit(cb)

Finalize publishing. `cb(err, hash)` fires with the new commit hash.

## var stream = archive.replicate(opts)

Create a duplex stream for replication of the underlying hyperlog and hyperdrive
data.

# install

```
npm install pkgdb
```

# license

BSD
