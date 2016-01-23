/* Author: Panu Ranta, panu.ranta@iki.fi, http://14142.net/kartalla/about.html */

'use strict';

function Map() {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.maMap = null;
        s.polylineCache = {};
        s.markers = {};
        s.nextMarkerId = 0;
        s.previousSymbolScale = null;
        return s;
    }

    this.init = function (lat, lng, zoomLevel) {
        state.maMap = new MapApiMap();
        state.maMap.init(lat, lng, zoomLevel, zoomChanged);
        state.previousSymbolScale = getSymbolScale();
    };

    function getSymbolScale() {
        var zoom = state.maMap.getZoom();
        if (zoom < 12) {
            return 1;
        } else if (zoom < 14) {
            return 2;
        } else if (zoom < 15) {
            return 3;
        } else {
            return 4;
        }
    }

    function zoomChanged() {
        var newScale = getSymbolScale();
        if (newScale !== state.previousSymbolScale) {
            updateSymbolScales(newScale);
        }
        state.previousSymbolScale = newScale;
    }

    function updateSymbolScales(newScale) {
        for (var markerId in state.markers) {
            var marker = state.markers[markerId]['marker'];
            marker.resize(newScale);
        }
    }

    this.restart = function (lat, lng, zoomLevel) {
        state.maMap.restart(lat, lng, zoomLevel);
    };

    this.resize = function (newHeight) {
        state.maMap.resize(newHeight);
    };

    this.decodePath = function (encodedPath) {
        return state.maMap.decodePath(encodedPath);
    };

    // path as returned by decodePath()
    this.addMarker = function (path, pathId, isVisible, color) {
        if (state.polylineCache[pathId] === undefined) {
            var polylineOptions = {
                isVisible: isVisible,
                color: 'black',
                opacity: 0.6,
                weight: 1
            };
            var newPolyline = state.maMap.newPolyline(path, polylineOptions);
            state.polylineCache[pathId] = {polyline: newPolyline, count: 1};
        } else {
            state.polylineCache[pathId].count += 1;
        }
        var polyline = state.polylineCache[pathId].polyline;
        var marker = new MapMarker(state.maMap);
        marker.init(state.nextMarkerId, polyline, isVisible, color, getSymbolScale());
        state.markers[state.nextMarkerId] = {marker: marker, pathId: pathId};
        state.nextMarkerId += 1;
        return marker;
    };

    this.updateMarker = function (marker, distanceFromStart, opacity, title) {
        marker.update(distanceFromStart, opacity, title);
    };

    this.setMarkerVisibility = function (marker, isVisible) {
        marker.setVisibility(isVisible);
    };

    this.removeMarker = function (marker) {
        var markerId = marker.getMarkerId();
        var pathId = state.markers[markerId]['pathId'];
        var isPolylineRemoved = false;

        state.polylineCache[pathId].count -= 1;
        if (state.polylineCache[pathId].count === 0) {
            isPolylineRemoved = true;
            delete state.polylineCache[pathId];
        }

        marker.remove(isPolylineRemoved);
        delete state.markers[markerId];
    };

    // path as returned by decodePath()
    this.getDistances = function (path, pathIndexes) {
        var distances = [0];
        var distanceFromStart = 0;

        for (var i = 1, j = 1; i < path.length; i++) {
            var p1 = path[i - 1];
            var p2 = path[i];
            var distanceInc = state.maMap.computeDistance(p1, p2);
            distanceFromStart += distanceInc;
            if (i === pathIndexes[j]) {
                j += 1;
                distances.push(Math.round(distanceFromStart));
            }
        }

        return distances;
    };

    this.getParams = function () {
        return state.maMap().getParams();
    };
}

function MapMarker(maMap) {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.markerId = null;
        s.maMarker = null;
        s.maPolyline = null;
        s.symbolElement = null;
        s.symbolBaseSize = 15;
        s.symbolForm = '';
        s.symbolAngle = 0; // 0-360, 0=north, 90=east, 180=south, 270=west
        s.title = '';
        return s;
    }

    this.init = function (markerId, maPolyline, isVisible, color, scale) {
        state.markerId = markerId;
        state.maPolyline = maPolyline;
        state.symbolElement = createSymbolElement(isVisible, color);
        state.maMarker = new MapApiMarker(maMap.getMap(), maPolyline);
        state.maMarker.init(createSymbolRootElement(state.symbolElement), isVisible,
                            scale * state.symbolBaseSize);
    };

    this.getMarkerId = function () {
        return state.markerId;
    };

    this.resize = function (newScale) {
        state.maMarker.resize(newScale * state.symbolBaseSize);
    };

    function createSymbolElement(isVisible, color) {
        var symbolElement = createSvgElement('g');
        symbolElement.style.visibility = getVisibilityString(isVisible);
        symbolElement.style.fill = color;
        symbolElement.addEventListener('mouseover', function () {
            updateSymbolTooltipElement(symbolElement);
        });
        symbolElement.addEventListener('mouseout', function () {
            hideSymbolTooltipElement(symbolElement);

        });
        return symbolElement;
    }

    function getSymbolTooltipElement() {
        var elementId = 'markerSymbolTooltip';
        var symbolTooltipElement = document.getElementById(elementId);
        if (symbolTooltipElement === null) {
            symbolTooltipElement = createSymbolTooltipElement(elementId);
            document.body.appendChild(symbolTooltipElement);
        }
        return symbolTooltipElement;
    }

    function createSymbolTooltipElement(elementId) {
        var symbolTooltipElement = document.createElement('div');
        symbolTooltipElement.id = elementId;
        symbolTooltipElement.style.position = 'absolute';
        symbolTooltipElement.style.padding = '5px';
        symbolTooltipElement.style.whiteSpace = 'pre';
        symbolTooltipElement.style.background = 'linear-gradient(to bottom, khaki, white)';
        return symbolTooltipElement;
    }

    function updateSymbolTooltipElement(symbolElement) {
        var rect = symbolElement.getBoundingClientRect();
        symbolElement.style.cursor = 'help';
        showSymbolTooltipElement(rect, state.title);
    }

    function showSymbolTooltipElement(rect, title) {
        var symbolTooltipElement = getSymbolTooltipElement();
        symbolTooltipElement.textContent = title;
        symbolTooltipElement.style.visibility = 'visible';

        var leftOffset = {true: 0,
            false: symbolTooltipElement.offsetWidth}[rect.left < (window.innerWidth / 2)];
        symbolTooltipElement.style.left = (rect.left - leftOffset) + 'px';
        var topOffset = {true: -rect.height,
            false: symbolTooltipElement.offsetHeight}[rect.top < (window.innerHeight / 2)];
        symbolTooltipElement.style.top = (rect.top - topOffset) + 'px';
    }

    function hideSymbolTooltipElement(symbolElement) {
        var symbolTooltipElement = getSymbolTooltipElement();
        symbolTooltipElement.style.visibility = 'hidden';
        symbolElement.style.cursor = '';
    }

    function getVisibilityString(isVisible) {
        return {true: 'visible', false: 'hidden'}[isVisible];
    }

    function createSymbolRootElement(svgSymbolElement) {
        var wrapperElement = document.createElement('div');
        var svgRootElement = createSvgElement('svg');
        svgRootElement.setAttribute('viewBox', '0 0 10 10');
        svgRootElement.appendChild(svgSymbolElement);
        wrapperElement.appendChild(svgRootElement);
        return wrapperElement;
    }

    function createSvgElement(elementType) {
        return document.createElementNS('http://www.w3.org/2000/svg', elementType);
    }

    this.update = function (distanceFromStart, opacity, title) {
        var polylinePath = maMap.getPolylinePath(state.maPolyline);
        var distance = getPathPositionAndHeading(polylinePath, distanceFromStart);

        var symbolForm = getSymbolForm(distanceFromStart, opacity);
        if (symbolForm !== state.symbolForm) {
            state.symbolForm = symbolForm;
            updateSymbol();
        }
        state.symbolElement.style.opacity = opacity;
        state.symbolElement.setAttribute('transform',
                                         'rotate(' + (distance.heading - 90) + ', 5, 5)');

        state.title = title;
        state.symbolAngle = distance.heading;

        state.maMarker.update(distance.position);
    };

    function getPathPositionAndHeading(polylinePath, distanceFromStart) {
        var cumulDistance = 0;
        var pathLength = maMap.getPathLength(polylinePath);

        for (var i = 1; i < pathLength; i++) {
            var p1 = maMap.getPathPoint(polylinePath, i - 1);
            var p2 = maMap.getPathPoint(polylinePath, i);
            var distanceInc = maMap.computeDistance(p1, p2);
            cumulDistance += distanceInc;
            if (cumulDistance > distanceFromStart) {
                var distanceFromP1 = (distanceFromStart - (cumulDistance - distanceInc));
                var fraction = distanceFromP1 / distanceInc;
                var position = maMap.interpolate(p1, p2, fraction);
                var heading = maMap.computeHeading(p1, p2);
                return {position: position, heading: heading};
            }
        }

        var p1 = maMap.getPathPoint(polylinePath, pathLength - 2);
        var p2 = maMap.getPathPoint(polylinePath, pathLength - 1);
        return {position: p2, heading: maMap.computeHeading(p1, p2)};
    }

    function getSymbolForm(distanceFromStart, opacity) {
        if (distanceFromStart === 0) {
            return 'square';
        } else {
            if (opacity < 1) {
                return 'circle';
            } else {
                return 'arrow';
            }
        }
    }

    function updateSymbol() {
        if (state.symbolForm === 'square') {
            var svgElement = createSvgElement('rect');
            svgElement.setAttribute('x', '2');
            svgElement.setAttribute('y', '2');
            svgElement.setAttribute('width', '6');
            svgElement.setAttribute('height', '6');
        } else if (state.symbolForm === 'circle') {
            var svgElement = createSvgElement('circle');
            svgElement.setAttribute('cx', '5');
            svgElement.setAttribute('cy', '5');
            svgElement.setAttribute('r', '3');
        } else { // arrow ->
            var svgElement = createSvgElement('path');
            svgElement.setAttribute('d', 'M 2,2 8,5 2,8 4,5 z');
        }

        if (state.symbolElement.firstChild !== null) {
            state.symbolElement.removeChild(state.symbolElement.firstChild);
        }
        state.symbolElement.appendChild(svgElement);
    }

    this.remove = function (isPolylineRemoved) {
        state.maMarker.remove();
        state.maMarker = null;
        if (isPolylineRemoved) {
            maMap.removePolyline(state.maPolyline);
            state.maPolyline = null;
        }
    };

    this.setVisibility = function (isVisible) {
        state.symbolElement.style.visibility = getVisibilityString(isVisible);
        state.maMarker.setVisibility(isVisible);
    };
}
