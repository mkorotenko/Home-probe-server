// server.js
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var events = require('events');
var db = require("./database")();

var port = 3500;//(process.env && process.env.PORT) || 3500;

app.use(express.static(__dirname + '/public'));
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});
//redirect / to our index.html file
app.get('/', function (req, res, next) {
  res.sendFile(__dirname + '/public/index.html');
});
app.get('/home', function (req, res) {
  res.sendFile(__dirname + '/public/index.html');
});
 
//baudRate: 128000
var serialPort = require("./serial-port")({ baudRate: 115200 });

var eventEmitter = new events.EventEmitter();
//when a client connects, do this
io.on('connection', function (client) {
  console.log('Socket: client connected');
  client.on('debugMode', function (data) { //get light switch status from client
    console.log('debugMode:', data); //turn LED on or off, for now we will just show it in console.log
    debugMode = data;
  });

  client.on('clearEmpty', function (data) { //get light switch status from client
    console.log('clearEmpty:', data); //turn LED on or off, for now we will just show it in console.log
    db.deleteData('probe', { temp: 0 }, () => {
      client.emit('newData');
    });
  });

  client.on('clearPipe', function (data) { //get light switch status from client
    console.log('clearPipe:', data); //turn LED on or off, for now we will just show it in console.log
    db.deleteData('probe', data, () => {
      client.emit('newData');
    });
  });

  client.on('sendToSerial', function (data) { //get light switch status from client
    const packet = serialPort.convertObjectToArray(data);
    console.log('sendToSerial:', packet, serialPort.decodeDate(data[4]).toJSON());
    serialPort.writeData(packet);
  });

  eventEmitter.on('newData', function (data) {
    client.emit('newData', data);
  });  
});

//start our web server and socket.io server listening
server.listen(port, function () {
  console.log(`HTTP server on port ${port}`);
});

serialPort.readData(function (data) {
  const pipes = [];
  if (data && data.length) {
    data.forEach(str => {
      // if (debugMode)
      //   console.info('temp:', str.temp.toFixed(1), ' hum:', str.hum.toFixed(1), ' date ', str.date.toISOString(), ' pipe ', str.pipe, ' rssi ', str.rssi, 'bat_v', str.bat_v);

      if (!pipes.includes(str.pipe)) {
        pipes.push(str.pipe);
      }
    });

    db.writeData('probe', data.filter(str => str.pipe != 255));
    pipes.forEach(pipe => {
      eventEmitter.emit('newData', { pipe: pipe });
    });
  }
})
serialPort.events.on('connected', () => {
  const packet = serialPort.convertObjectToArray([100, 0,0,0, serialPort.encodeDate(new Date())]);
  console.log('Serial update time:', packet);
  serialPort.writeData(packet);
});

app.get('/docs/:docDate/:docPipe', function (req, res) {
  db.readData('probe', {
    pipe: Number(req.params.docPipe || 1),
    serverDate: {
      $gte: new Date(req.params.docDate)
    }
  }, function (data) {
    res.json(data);
  });
});
