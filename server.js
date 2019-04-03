// server.js
var express = require('express');  
var app = express();  
var server = require('http').createServer(app); 
var io = require('socket.io')(server);
var events = require('events');
var db = require("./database")();

var debugMode = false;

app.use(express.static(__dirname + '/public')); 
//redirect / to our index.html file
app.get('/', function(req, res,next) {  
    res.sendFile(__dirname + '/public/index.html');
});
app.get('/about', function(req, res) {
    res.send('about');
});

var com = require("./serial-port")('COM3',{
    baudRate: 128000
});

var eventEmitter = new events.EventEmitter();
//when a client connects, do this
io.on('connection', function(client) {  
    console.log('Socket: client connected');
    client.on('debugMode', function(data) { //get light switch status from client
       console.log('debugMode:', data); //turn LED on or off, for now we will just show it in console.log
       debugMode = data;
    });

    client.on('clearEmpty', function(data) { //get light switch status from client
      console.log('clearEmpty:', data); //turn LED on or off, for now we will just show it in console.log
      db.deleteData('probe', {temp: 0}, () => {
        client.emit('newData');
      });
   });

   client.on('sendToSerial', function(data) { //get light switch status from client
    function toByteArray(_x) {
      let bytes = [], x = _x;
      if (!x && typeof x === 'number') {
        bytes = [0];
      }
      while(x) {
        bytes.push(x & 255);
        x = x >> 8;
      };
      //bytes.reverse();
      return bytes;
    };
    function getArray(n) {
      res = [];
      for(let i=0; i<n; i++) {
        res.push(0);
      }
      return res;
    };
    let packet;
    if (data instanceof Array) {
      packet = [];
      data.map(n => toByteArray(n)).forEach(a => packet = [].concat(packet, a));
    } else {
      packet = data;
    }
    if (packet.length < 8) {
      packet = [].concat(packet, getArray(8-packet.length));
    }
    console.log('sendToSerial:', packet); //turn LED on or off, for now we will just show it in console.log`
    com.writeData(packet);
  });

   eventEmitter.on('newData', function() {
        client.emit('newData');
   });
});

//start our web server and socket.io server listening
server.listen(3000, function(){
  console.log('HTTP server on port 3000');
}); 

var k_adc = 3.3/4095;
var k_v = 4.11/1.98;
var s_k = k_adc*k_v;
var v_min = 1960;
com.readData(function(str) {
  if (str.pipe === 1) {
    str.bat_v = Math.round((str.bat_v*4+v_min)*s_k*100)/100;
    str.date = new Date(str.date * 1000);
  } else {
    str.bat_v = Math.round((str.bat_v*4+1132)*0.002315*100)/100;
    let zipDate = str.date;
    let s,m,h,dd,mm,yy;
    s = zipDate & 63;
    zipDate = zipDate >> 6;
    m = zipDate & 63;
    zipDate = zipDate >> 6;
    h = zipDate & 31;
    zipDate = zipDate >> 5;
    dd = zipDate & 31;
    zipDate = zipDate >> 5;
    mm = zipDate & 15;
    zipDate = zipDate >> 4;
    yy = zipDate & 63;
    str.date = new Date(Date.UTC(2000+yy,mm-1,dd,h,m,s));
  }

    if (debugMode) 
        console.info('temp:', str.temp.toFixed(1),' hum:', str.hum.toFixed(1), ' date ', str.date.toISOString(), ' pipe ', str.pipe, ' tx_res ', str.tx_res, 'bat_v', str.bat_v);
    var skip = false;
    // if (prevData) {
    //     if ((str.date.getTime() - prevData) < 2000)
    //         skip = true;
    // }
    prevData = str.date.getTime();
    if (!skip) {
        db.writeData('probe', [str]);
        eventEmitter.emit('newData');
    }
    com.writeData([2,0,0]);
})
app.get('/docs/:docDate/:docPipe', function(req, res) {
    db.readData('probe', {
      pipe: Number(req.params.docPipe || 1),
      serverDate: {
        $gte: new Date(req.params.docDate)
      }
    }, function(data){
        res.json(data);
    });
});
