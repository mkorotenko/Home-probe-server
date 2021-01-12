// server.js
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var events = require('events');
var db = require("./database")();

var debugMode = false;

var serialName = (process.env && process.env.SERIAL) || 'COM3';
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
var com = require("./serial-port")(serialName, {
  baudRate: 115200
});

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
    // function toByteArray(_x) {
    //   let bytes = [], x = _x;
    //   if (!x && typeof x === 'number') {
    //     bytes = [0];
    //   }
    //   while (x) {
    //     bytes.push(x & 255);
    //     x = x >> 8;
    //   };
    //   //bytes.reverse();
    //   return bytes;
    // };
    // function getArray(n) {
    //   res = [];
    //   for (let i = 0; i < n; i++) {
    //     res.push(0);
    //   }
    //   return res;
    // };
    // let packet;
    // if (data instanceof Array) {
    //   packet = [];
    //   data.map(n => toByteArray(n)).forEach(a => packet = [].concat(packet, a));
    // } else {
    //   packet = data;
    // }
    // if (packet.length < 8) {
    //   packet = [].concat(packet, getArray(8 - packet.length));
    // }
    const packet = com.convertObjectToArray(data);
    console.log('sendToSerial:', packet); //turn LED on or off, for now we will just show it in console.log`
    com.writeData(packet);
  });

  eventEmitter.on('newData', function (data) {
    client.emit('newData', data);
  });
});

//start our web server and socket.io server listening
server.listen(port, function () {
  console.log(`HTTP server on port ${port}`);
});

com.readData(function (data) {
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

  //com.writeData([2, 255, 0]);
})
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

// function processData(temp4) {
//   let m = temp4.map(i => ({bat_v:i.bat_v, date: (new Date(i.date==='1970-01-01T00:00:00.000Z'? i.serverDate : i.date)).toLocaleDateString()}));
//   let r={};
//   m.forEach(i => {
//     let c = r[i.date] || (r[i.date]={bat_v:0, count:0, volt:0});
//     c.bat_v+=i.bat_v;
//     c.count++;
//     c.volt = Math.round((c.bat_v/c.count)*10000)/10000;
//   });
// return r;
// }
