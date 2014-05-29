var express = require('express');
var router = express.Router();
var mongo   = require('mongodb');
var Grid    = require('gridfs-stream');
var db      = new mongo.Db('projekt', new mongo.Server("localhost", 27017), {safe:true});

/* GET home page. */
router.get('/', function(req, res) {
  res.render('index', { title: 'Express' });
});

/* POST to retrieve photos data*/
router.post('/photos', function(req, res) {
	var photoId = req.body.photoId;
	db.open(function () {
		var gfs = Grid(db, mongo);
		if (photoId) {
			var bufs = [];
			var readstream = gfs.createReadStream({
				_id: photoId,
				root: 'photoscollection'
			});
			readstream.on('error', function (err) {
			  console.log('An error occurred!', err);
			  db.close();
			  throw err;
			})
			.on('data', function (d) { bufs.push(d);})
			.on('close', function () { db.close(); })
			.on('end', function () {
				var fbuf = Buffer.concat(bufs);
				res.send((fbuf.toString('base64')));
				db.close();
			});
		}
		else {
			gfs.collection('photoscollection').find().toArray(function (err, files) {
				res.send({photos: files});
				db.close();
			});
		}
	});
});

router.post('/upload', function(req, res) {
	var fs = require('fs');
	console.log(req.files[0].userName);
	db.open(function () {
		var gfs = Grid(db, mongo);
		var writestream = gfs.createWriteStream( {
				filename: req.files[0].name,
				root: 'photoscollection',
				metadata: {
					userName: req.userName,
					favourite: false
				}
			});
		writestream.on('close', function (file) {
			res.send({fileName: file.filename});
			db.close();
		});
		fs.createReadStream(req.files[0].path)
		.pipe(writestream);
	});
});

module.exports = router;
