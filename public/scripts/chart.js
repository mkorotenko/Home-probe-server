function getData(startDate) {
  var Temp = [],
      Hum = [],
	  Volt = [];

  var xmlHttp = new XMLHttpRequest();
  var theUrl = `/docs/${startDate.toISOString()}/${document.getElementById('pipe').value}`;
  xmlHttp.open( "GET", theUrl, false ); // false for synchronous request
  xmlHttp.send( null );
  var probe = JSON.parse(xmlHttp.responseText).filter(
    i => i.temp > 8.5 && i.hum <= 100
  );

  for(var i=0; i<probe.length; i++) {
    let date = new Date(probe[i].date.replace('.000Z', '+0200'));
    //let date = new Date(probe[i].serverDate);
    Temp.push({x: date, y: probe[i].temp});
    Hum.push({x: date, y: probe[i].hum});
    Volt.push({x: date, y: probe[i].bat_v-0.04});// 1.74
  }
  return [
    {
      values: Hum,
      key: 'Hum %',
      color: '#2ca02c'
    },
    {
      values: Temp,
      key: 'Temp C',
      color: '#ff7f0e'
    },
    {
      values: Volt,
      key: 'Bat V',
      color: '#123d9e'
    },  ];
}
  
  // Maintian an instance of the chart 
var chart; 

// Maintain an Instance of the SVG selection with its data
var chartData;

nv.addGraph(function() {
  chart = nv.models.lineChart()
    .useInteractiveGuideline(true)
    //.margin({top: 20, right: 20, bottom: 20, left: 20});
  
  chart.xAxis
    .axisLabel('Time')
    .tickFormat(d3.timeFormat("%H:%M"));
 
  chart.yAxis
    .axisLabel('Values')
    .tickFormat(d3.format('.01f'));
  
  chartData = d3.select('#chart svg')
    .datum(getData(getStartDate()));
  chartData.transition().duration(500)
    .call(chart);
  
  nv.utils.windowResize(chart.update);
  return chart;
});

function getStartDate() {
  var cDate = new Date();
  var sel = d3.select("#period");
  var periodLength = 0;
  if (sel && sel.length)
    periodLength = sel[0][0].value*60*60*1000;
  return new Date(cDate.getTime() - periodLength);
}

function update() {
  // Update the SVG with the new data and call chart
  chartData.datum(getData(getStartDate())).transition().duration(500).call(chart);
  nv.utils.windowResize(chart.update);
};

d3.select("#update").on("click", update);
d3.select("#period").on("change", update);
d3.select("#pipe").on("change", update);
window.chartUpdateRequest(function(data){
  if (data && data.pipe) {
    if (data.pipe == document.getElementById('pipe').value) {
      update();
    }
  } else {
    update();
  }
});

window.setPipeDateTime = function(pipe, date) {
  let d = date || new Date();
  socket.emit("sendToSerial", [3,0,pipe,0,window.dateTimeZIP(19,d.getMonth()+1,d.getDate(),d.getHours(),d.getMinutes(),d.getSeconds())]);
}
window.setPipePeriod = function(pipe, period) {
  //socket.emit("sendToSerial", [ 5, 0, 12, 0, 597 ]);
  socket.emit("sendToSerial", [ 5, 0, pipe, 0, period - 3 ]);
}
window.setPipeZeroVal = function(pipe, val) {
  //socket.emit("sendToSerial", [ 4, 0, 12, 0, 120 ])
  socket.emit("sendToSerial", [ 4, 0, pipe, 0, val ]);
}
window.setPipeAddr = function(pipe, addr) {
  socket.emit("sendToSerial", [ 6, 0, pipe, 0, addr ]);
}
window.setPipeDBm = function(pipe, dbm) {
  socket.emit("sendToSerial", [ 7, 0, pipe, 0, dbm ]);
}
