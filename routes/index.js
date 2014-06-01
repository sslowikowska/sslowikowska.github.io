var express = require('express');
var router = express.Router();
var mongo   = require('mongodb');
var Grid    = require('gridfs-stream');
var db      = new mongo.Db('projekt', new mongo.Server("localhost", 27017), {safe:true});

/* GET home page. */
router.get('/', function(req, res) {
  res.render('index', { title: 'Express' });
});

router.post('/setFavourite', function(req, res) {	
	var photoId = req.body.photoId;	
	var isFavourite = req.body.isFavourite ? JSON.parse(req.body.isFavourite) : false;
	console.log(photoId);
	console.log(isFavourite);
	db.open(function () {
		var gfs = Grid(db, mongo);
		gfs.collection('photoscollection')
			.update({_id: mongo.BSONPure.ObjectID(photoId)},
				{$set: {'metadata.favourite': isFavourite}},
				function (err, result) {
					db.close();
					res.end();
				    console.log(result);
			   });
	});
});

router.get(/^\/image\/(\w+)(?:\.\.(\w+))?$/, function(req, res) {
	var photoId = req.params[0];
	db.open(function () {
		var gfs = Grid(db, mongo);
		var bufs = [];
		gfs.collection('photoscollection').findOne({_id: mongo.BSONPure.ObjectID(photoId)}, function(err, doc) {
			var readstream = gfs.createReadStream({
				_id: photoId,
				root: 'photoscollection'
			});
			readstream.on('error', function (err) {
			  console.log('An error occurred!', err);
			  db.close();
			  res.render('error', {message: err});
			})
			.on('data', function (d) { bufs.push(d);})
			.on('close', function () { db.close(); })
			.on('end', function () {
				var fbuf = Buffer.concat(bufs);
				var imageContent = fbuf.toString('base64');
				res.render('image', {imageContent : imageContent, isFavourite: doc.metadata.favourite, photoId: photoId});
				db.close();
			});
		});
	});	
});

/* POST to retrieve photos data*/
router.post('/photos', function(req, res) {
	var photoId = req.body.photoId;	
	var showFavourites = req.body.showFavourites ? JSON.parse(req.body.showFavourites) : false;
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
			  res.render('error', {message: err});
			})
			.on('data', function (d) { bufs.push(d);})
			.on('close', function () { db.close(); })
			.on('end', function () {
				var fbuf = Buffer.concat(bufs);
				var imageContent = fbuf.toString('base64');
				if (req.body.showBig) {
					res.render('image', {imageContent : imageContent});
				}
				else {
					res.send(imageContent);
				}
				db.close();
			});
		}
		else {
			var filter = showFavourites ? { 'metadata.favourite': true} : null;
			console.log(filter);
			gfs.collection('photoscollection').find(filter).toArray(function (err, files) {
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
