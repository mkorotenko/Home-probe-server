var SerialPort = require('serialport');
var Buffer = require('buffer').Buffer;
//var k1 = 0.02715;
module.exports = function(port,options) {
    var port = new SerialPort(port,options);
    return {
        readData: function(callback) {
            port.on('data', function (data) {
                let str = {
                    temp: data.readUInt16LE(0)/10,
                    hum: data.readUInt16LE(2)/10,
                    date: data.readUInt32LE(4),
                    serverDate: new Date(),
                    pipe: data.readUInt8(8),
                    tx_res: data.readInt8(9),
                    bat_v: Math.round(data.readUInt8(10))
                }
                callback(str);
            });        
        },
        writeData: function(data) {
            var buf = Buffer.from(data);
            port.write(buf);
        }
    }
};
