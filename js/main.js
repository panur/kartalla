/* Author: Panu Ranta, panu.ranta@iki.fi */

function main() {
    var map = new Map();
    map.init();
    var gtfs = new Gtfs();
    var controller = new Controller(gtfs, map);

    var readyEvent = document.createEvent('Event');
    readyEvent.initEvent('gtfsIsReady', false, false);
    document.addEventListener('gtfsIsReady', start, false);

    gtfs.init('json/132.json', readyEvent);

    function start() {
        controller.start();
    }
}
