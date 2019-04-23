/* Author: Panu Ranta, panu.ranta@iki.fi, https://14142.net/kartalla/about.html */

/* Show markers on Leaflet
API Reference: http://leafletjs.com/reference.html
*/

'use strict';

function MapApiMap() {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.map = null;
        s.control = null;
        s.ownLocation = null;
        return s;
    }

    this.init = function (lat, lng, zoomLevel, zoomChanged, boundsChanged) {
        var baseMaps = getBaseMaps();

        state.map = L.map('map_canvas', {
            center: [lat, lng],
            zoom: zoomLevel,
            zoomControl: false,
            layers: [baseMaps.Mapbox]
        });
        state.map.addControl(L.control.zoom({position: 'bottomright'}));

        // toggle CSS marker interpolation via a HTML class:
        L.DomUtil.addClass(state.map.getContainer(), 'kartalla-interpolate');
        state.map.on('zoomstart', function() {
            L.DomUtil.removeClass(state.map.getContainer(), 'kartalla-interpolate');
        });
        state.map.on('zoomend', function() {
	    // re-enable interpolation starting at next render:
            L.Util.requestAnimFrame(function() {
                L.DomUtil.addClass(state.map.getContainer(), 'kartalla-interpolate');
            });
        });

        state.map.on('zoomend', zoomChanged);
        state.map.on('moveend', function () {
            var bounds = state.map.getBounds();
            var sw = bounds.getSouthWest();
            var ne = bounds.getNorthEast();
            boundsChanged(state.map.getZoom(), sw.lat, sw.lng, ne.lat, ne.lng);
        });

        L.control.layers(baseMaps, null, {position: 'topleft'}).addTo(state.map);
    };

    function getBaseMaps() {
        var url = 'https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}';
        var mapbox = L.tileLayer(url, {
            attribution: 'Map data &copy; <a href="https://openstreetmap.org">OpenStreetMap</a> ' +
                'contributors, ' +
                '<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
                'Imagery &copy; <a href="https://mapbox.com">Mapbox</a>',
            maxZoom: 18,
            id: 'mapbox.streets',
            accessToken: 'pk.eyJ1IjoicGFudXIiLCJhIjoiY2lqMzZnZWJuMDAz' +
                'eXR0a25jYm84Y2M4ZCJ9.0JDpHBxZNybehgLgGBAO9g'
        });
        var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; ' +
                '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        });
        var hsl = L.tileLayer('https://api.digitransit.fi/map/v1/hsl-map/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: 'Map data &copy; ' +
                '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, ' +
                'Tiles &copy; <a href="https://digitransit.fi/">Digitransit</a>'
        });
        return {'Mapbox': mapbox, 'OpenStreetMap': osm, 'HSL': hsl};
    }

    this.getMap = function () {
        return state.map;
    };

    this.restart = function (lat, lng, zoomLevel) {
        state.map.setView([lat, lng], zoomLevel);
    };

    this.resize = function (newHeight) {
        state.map.getContainer().style.height = newHeight + 'px';
        state.map.invalidateSize();
    };

    this.clearOwnLocation = function () {
        if (state.ownLocation !== null) {
            state.map.removeLayer(state.ownLocation);
        }
    };

    this.updateOwnLocation = function (lat, lng, radius, circleOptions) {
        var pathOptions = {
            'color': circleOptions['strokeColor'],
            'weight': circleOptions['strokeWeight'],
            'opacity': circleOptions['strokeOpacity'],
            'fillColor': circleOptions['fillColor'],
            'fillOpacity': circleOptions['fillOpacity'],
            'clickable': false
        };
        state.ownLocation = L.circle([lat, lng], radius, pathOptions);
        state.ownLocation.addTo(state.map);
        state.map.fitBounds(state.ownLocation.getBounds(), {'maxZoom': 16});
    };

    this.decodePath = function (encodedPath) {
        return decodeLine(encodedPath);
    };

    // http://code.google.com/apis/maps/documentation/utilities/include/polyline.js
    // Decode an encoded polyline into a list of latLng.
    function decodeLine(encoded) {
        var len = encoded.length;
        var index = 0;
        var array = [];
        var lat = 0;
        var lng = 0;

        while (index < len) {
            var b;
            var shift = 0;
            var result = 0;
            do {
                b = encoded.charCodeAt(index++) - 63;
                result |= (b & 0x1f) << shift;
                shift += 5;
            } while (b >= 0x20);
            var dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
            lat += dlat;

            shift = 0;
            result = 0;
            do {
                b = encoded.charCodeAt(index++) - 63;
                result |= (b & 0x1f) << shift;
                shift += 5;
            } while (b >= 0x20);
            var dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
            lng += dlng;

            array.push(L.latLng(lat * 1e-5, lng * 1e-5));
        }

        return array;
    }

    // path as returned by decodePath()
    this.newPolyline = function (path, polylineOptions) {
        var polyline = L.polyline(path, {
            clickable: false, // https://github.com/panur/kartalla/issues/8
            color: polylineOptions.color,
            opacity: polylineOptions.opacity,
            weight: polylineOptions.weight
        });
        return polyline;
    };

    this.getPolylinePath = function (polyline) {
        return polyline.getLatLngs();
    };

    this.setPolylineOptions = function (polyline, polylineOptions) {
        polyline.setStyle({'color': polylineOptions['color'],
                           'weight': polylineOptions['weight']});
    };

    this.removePolyline = function (polyline) {
        state.map.removeLayer(polyline);
    };

    // polylinePath as returned by getPolylinePath()
    this.getPathLength = function (polylinePath) {
        return polylinePath.length;
    };

    // polylinePath as returned by getPolylinePath()
    this.getPathPoint = function (polylinePath, index) {
        return polylinePath[index];
    };

    this.getPathLatLon = function (polylinePath, index) {
        return new LatLon(polylinePath[index].lat, polylinePath[index].lng);
    };

    this.getLatLng = function (latLon) {
        return L.latLng(latLon.lat, latLon.lon);
    };

    this.computeDistance = function(p1, p2) {
        return p1.distanceTo(p2);
    };

    this.interpolate = function(p1, p2, fraction) {
        var radius = 6378137; // earth's radius in meters
        var distance = that.computeDistance(p1, p2);
        var bearing = that.computeHeading(p1, p2);
        var p1LatLon = new LatLon(p1.lat, p1.lng);
        var newLatLon = p1LatLon.destinationPoint(fraction * distance, bearing, radius);
        return that.getLatLng(newLatLon);
    };

    this.computeHeading = function (p1, p2) {
        var p1LatLon = new LatLon(p1.lat, p1.lng);
        var p2LatLon = new LatLon(p2.lat, p2.lng);
        return p1LatLon.bearingTo(p2LatLon);
    };

    this.getZoom =  function () {
        return state.map.getZoom();
    };

    this.getParams = function () {
        var center = state.map.getCenter();
        return {'lat': center.lat, 'lng': center.lng, 'zoom': state.map.getZoom()};
    };

    this.addLocationControl = function (controlElement) {
        var CustomControl = L.Control.extend({
            options: {
                position: 'topright'
            },
            onAdd: function (map) {
                return controlElement;
            }
        });
        state.map.addControl(new CustomControl());
    };

    this.toggleUiBarControl = function (controlElement) {
        if (controlElement === undefined) {
            state.map.removeControl(state.control);
            state.control = null;
        } else {
            var CustomControl = L.Control.extend({
                options: {
                    position: 'bottomleft'
                },
                onAdd: function (map) {
                    return controlElement;
                }
            });
            state.control = new CustomControl();
            state.map.addControl(state.control);
            var parentZIndex =
                window.getComputedStyle(controlElement.parentNode).getPropertyValue('z-index');
            /* in small resolution display bottomleft and bottomright may overlap */
            controlElement.parentNode.style.zIndex = parentZIndex + 1;
        }
    };
}

function MapApiMarker(map, polyline) {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.latLng = null;
        s.symbolRootElement = null;
        s.isVisible = false;
        s.size = null;
        s.isMarkerOnMap = false;
        s.isPolylineOnMap = false;
        s.nativeMarker = null;
        return s;
    }

    this.init = function (symbolRootElement, isVisible, size) {
        state.symbolRootElement = symbolRootElement;
        state.isVisible = isVisible;
        state.size = size;
    };

    function createNativeMarker() {
        return L.marker(state.latLng, {
            clickable: false, // https://github.com/panur/kartalla/issues/8
            icon: createIcon(state.symbolRootElement)
        });
    }

    function createIcon(symbolRootElement) {
        var iconOptions = {domElement: symbolRootElement, className: ''};
        return new DomIcon(iconOptions);
    }

    var DomIcon = L.DivIcon.extend({
        options: {
            domElement: null
        },

        createIcon: function(oldIcon) {
            var div = (oldIcon && (oldIcon.tagName === 'DIV')) ? oldIcon : this.options.domElement;
            this._setIconStyles(div, 'icon');
            return div;
        }
    });

    this.update = function(latLng) {
        state.latLng = latLng;
        var isInViewport = map.getBounds().contains(state.latLng);
        if ((state.isVisible === true) && (isInViewport == true)) {
            if (state.isMarkerOnMap === false) {
                state.isMarkerOnMap = true;
                state.nativeMarker = createNativeMarker();
                that.resize(state.size);
                state.nativeMarker.addTo(map);
            }
            if (state.isPolylineOnMap === false) {
                state.isPolylineOnMap = true;
                polyline.addTo(map);
            }
            state.nativeMarker.setLatLng(latLng);
            state.nativeMarker.update();
        } else {
            that.remove();
            if ((state.isVisible === false) && (state.isPolylineOnMap === true)) {
                state.isPolylineOnMap = false;
                map.removeLayer(polyline);
            }
        }
    };

    this.remove = function() {
        if (state.isMarkerOnMap) {
            state.isMarkerOnMap = false;
            map.removeLayer(state.nativeMarker);
            state.nativeMarker = null;
        }
    };

    this.resize = function(newSize) {
        state.size = newSize;
        if (state.isMarkerOnMap) {
            var icon = state.nativeMarker.options.icon;
            icon.options.iconSize = new L.Point(newSize, newSize);
            state.nativeMarker.setIcon(icon);
        }
    };

    this.setVisibility = function (newIsVisible) {
        state.isVisible = newIsVisible;
        if (state.latLng !== null) {
            that.update(state.latLng);
        }
    };
}
