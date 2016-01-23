/* Author: Panu Ranta, panu.ranta@iki.fi, http://14142.net/kartalla/about.html */

/* Show markers on Google Maps
API Reference: https://developers.google.com/maps/documentation/javascript/reference
*/

'use strict';

function MapApiMap() {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.map = null;
        return s;
    }

    this.init = function (lat, lng, zoomLevel, zoomChanged) {
        var mapElement = document.getElementById('map_canvas');
        var mapOptions = {
            mapTypeId: google.maps.MapTypeId.ROADMAP,
            mapTypeControlOptions: {style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR},
            zoomControlOptions: {style: google.maps.ZoomControlStyle.DEFAULT},
            panControl: true,
            zoomControl: true,
            scaleControl: true,
            streetViewControl: true,
            styles: [{
                featureType: 'road.arterial',
                elementType: 'geometry.fill',
                stylers: [{color: '#FBF8A5' }]
            }]
        };

        state.map = new google.maps.Map(mapElement, mapOptions);
        state.map.setOptions({center: new google.maps.LatLng(lat, lng), zoom: zoomLevel});
        state.map.addListener('zoom_changed', zoomChanged);
    };

    this.getMap = function () {
        return state.map;
    };

    this.restart = function (lat, lng, zoomLevel) {
        state.map.setCenter({lat: lat, lng: lng});
        state.map.setZoom(zoomLevel);
    };

    this.resize = function (newHeight) {
        state.map.getDiv().style.height = newHeight + 'px';
        google.maps.event.trigger(state.map, 'resize');
    };

    this.decodePath = function (encodedPath) {
        return google.maps.geometry.encoding.decodePath(encodedPath);
    };

    // path as returned by decodePath()
    this.newPolyline = function (path, polylineOptions) {
        var polyline = new google.maps.Polyline({
            path: path,
            visible: polylineOptions.isVisible,
            geodesic: true,
            strokeColor: polylineOptions.color,
            strokeOpacity: polylineOptions.opacity,
            strokeWeight: polylineOptions.weight
        });
        return polyline;
    };

    this.getPolylinePath = function (polyline) {
        return polyline.getPath();
    };

    this.removePolyline = function (polyline) {
        polyline.setMap(null);
    };

    // polylinePath as returned by getPolylinePath()
    this.getPathLength = function (polylinePath) {
        return polylinePath.getLength();
    };

    // polylinePath as returned by getPolylinePath()
    this.getPathPoint = function (polylinePath, index) {
        return polylinePath.getAt(index);
    };

    this.computeDistance = function(p1, p2) {
        return google.maps.geometry.spherical.computeDistanceBetween(p1, p2)
    };

    this.interpolate = function(p1, p2, fraction) {
        return google.maps.geometry.spherical.interpolate(p1, p2, fraction);
    };

    this.computeHeading = function (p1, p2) {
        return google.maps.geometry.spherical.computeHeading(p1, p2);
    };

    this.getZoom =  function () {
        return state.map.getZoom();
    };

    this.getParams = function () {
        var center = state.map.getCenter();
        return {'lat': center.lat(), 'lng': center.lng(), 'zoom': state.map.getZoom()};
    };
}

function MapApiMarker(map, polyline) {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.latLng = null;
        s.symbolRootElement = null;
        s.size = null;
        return s;
    }

    this.init = function (symbolRootElement, isVisible, size) {
        symbolRootElement.style.position = 'absolute';
        state.symbolRootElement = symbolRootElement;
        that.setVisibility(isVisible);
        that.resize(size);
    };

    this.onAdd = function() { // part of OverlayView
        var panes = that.getPanes();
        panes.overlayImage.appendChild(state.symbolRootElement);
    };

    this.draw = function() { // part of OverlayView
        var projection = that.getProjection();
        if (projection !== undefined) {
            var point = projection.fromLatLngToDivPixel(state.latLng);
            if (point !== null) {
                state.symbolRootElement.style.left = (point.x - state.size / 2) + 'px';
                state.symbolRootElement.style.top = (point.y - state.size / 2) + 'px';
            }
        }
    };

    this.update = function(latLng) {
        state.latLng = latLng;
        if (that.getMap() === undefined) {
            that.setMap(map);
        }
        if (polyline.getMap() === undefined) {
            polyline.setMap(map);
        }
        that.draw();
    };

    this.onRemove = function() { // part of OverlayView
        state.symbolRootElement.parentNode.removeChild(state.symbolRootElement);
        state.symbolRootElement = null;
    };

    this.remove = function() {
        that.setMap(null);
    };

    this.resize = function(newSize) {
        state.size = newSize;
        state.symbolRootElement.style.width = newSize + 'px';
        state.symbolRootElement.style.height = newSize + 'px';
    };

    this.setVisibility = function (newIsVisible) {
        polyline.setVisible(newIsVisible);
    };
}

MapApiMarker.prototype = new google.maps.OverlayView();
