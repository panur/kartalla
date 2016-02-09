/* Author: Panu Ranta, panu.ranta@iki.fi, http://14142.net/kartalla/about.html */

'use strict';

function Map(utils) {
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
        if (zoom < 11) {
            return 1;
        } else if (zoom < 14) {
            return 3;
        } else if (zoom < 15) {
            return 4;
        } else {
            return 5;
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
    this.addMarker = function (path, pathId, isVisible, color, routeName, getTitleText) {
        if (state.polylineCache[pathId] === undefined) {
            var polylineOptions = {
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
        var marker = new MapMarker(utils, state.maMap);
        marker.init(state.nextMarkerId, polyline, isVisible, color, getSymbolScale(), routeName,
                    getTitleText);
        state.markers[state.nextMarkerId] = {marker: marker, pathId: pathId};
        state.nextMarkerId += 1;
        return marker;
    };

    this.updateVpMarker = function (marker, lat, lng) {
        return marker.updateVp(lat, lng);
    };

    this.updateDistanceMarker = function (marker, distanceFromStart, isPastLastArrival) {
        marker.updateDistance(distanceFromStart, isPastLastArrival);
    };

    this.updateMarkerOpacity = function (marker, opacity) {
        marker.updateOpacity(opacity);
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
        return state.maMap.getParams();
    };

    this.toggleControl = function (controlElement) {
        state.maMap.toggleControl(controlElement);
    };
}

function MapMarker(utils, maMap) {
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
        s.routeName = null;
        s.getTitleText = null;
        s.previousUpdateType = null;
        return s;
    }

    this.init = function (markerId, maPolyline, isVisible, color, scale, routeName, getTitleText) {
        state.markerId = markerId;
        state.maPolyline = maPolyline;
        state.symbolElement = createSymbolElement(isVisible, color);
        state.maMarker = new MapApiMarker(maMap.getMap(), maPolyline);
        state.maMarker.init(createSymbolRootElement(state.symbolElement), isVisible,
                            scale * state.symbolBaseSize);
        state.routeName = routeName;
        state.getTitleText = getTitleText;
    };

    this.getMarkerId = function () {
        return state.markerId;
    };

    this.resize = function (newScale) {
        state.maMarker.resize(newScale * state.symbolBaseSize);
        updateTextTitle();
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
        showSymbolTooltipElement(rect, state.getTitleText(state.previousUpdateType));
    }

    function showSymbolTooltipElement(rect, title) {
        var symbolTooltipElement = getSymbolTooltipElement();
        symbolTooltipElement.textContent = title;
        symbolTooltipElement.style.visibility = 'visible';
        utils.setDomTooltipPosition(symbolTooltipElement, rect);
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

    this.updateVp = function (lat, lng) {
        var latLon = new LatLon(lat, lng);
        var minDist = getMinDistanceToPolyline(latLon);

        if (minDist['d'] < 100) {
            var heading = minDist['p1'].bearingTo(minDist['p2']);
            var position = maMap.getLatLng(latLon);
            update('vp', 'arrow', heading, position);
            return true;
        } else {
            return false;
        }
    };

    function getMinDistanceToPolyline(latLon) {
        var polylinePath = maMap.getPolylinePath(state.maPolyline);
        var pathLength = maMap.getPathLength(polylinePath);
        var result = {'d': Number.MAX_VALUE, 'p1': null, 'p2': null};

        for (var i = 1; i < pathLength; i++) {
            var p1 = maMap.getPathLatLon(polylinePath, i - 1);
            var p2 = maMap.getPathLatLon(polylinePath, i);
            var p = latLon.nearestPointOnSegment(p1, p2);
            var d = p.distanceTo(latLon);
            if (d < result['d']) {
                result['d'] = d; // distance from latLon to segment in meters
                result['p1'] = p1; // segment start LatLon
                result['p2'] = p2; // segment end LatLon
            }
        }
        return result;
    };

    this.updateDistance = function (distanceFromStart, isPastLastArrival) {
        var polylinePath = maMap.getPolylinePath(state.maPolyline);
        var distance = getPathPositionAndHeading(polylinePath, distanceFromStart);
        var symbolForm = getSymbolForm(distanceFromStart, isPastLastArrival);

        update('distance', symbolForm, distance.heading, distance.position);
    };

    function update(updateType, symbolForm, heading, position) {
        if ((symbolForm !== state.symbolForm) || (updateType !== state.previousUpdateType)) {
            state.symbolForm = symbolForm;
            state.previousUpdateType = updateType;
            updateSymbol();
            updateTextTitle();
        }

        var formElement = state.symbolElement.firstChild;
        formElement.setAttribute('transform', 'rotate(' + (heading - 90) + ', 5, 5)');

        state.maMarker.update(position);
    }

    this.updateOpacity = function (opacity) {
        state.symbolElement.style.opacity = opacity;
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

    function getSymbolForm(distanceFromStart, isPastLastArrival) {
        if (distanceFromStart === 0) {
            return 'square';
        } else {
            if (isPastLastArrival) {
                return 'circle';
            } else {
                return 'arrow';
            }
        }
    }

    function updateSymbol() {
        if (state.symbolForm === 'square') {
            var svgElement = createSvgElement('rect');
            svgElement.setAttribute('x', '3');
            svgElement.setAttribute('y', '3');
            svgElement.setAttribute('width', '4');
            svgElement.setAttribute('height', '4');
        } else if (state.symbolForm === 'circle') {
            var svgElement = createSvgElement('circle');
            svgElement.setAttribute('cx', '5');
            svgElement.setAttribute('cy', '5');
            svgElement.setAttribute('r', '2');
        } else { // arrow ->
            var svgElement = createSvgElement('path');
            svgElement.setAttribute('d', 'M 2,2 8,5 2,8 4,5 z');
        }

        while (state.symbolElement.firstChild !== null) {
            state.symbolElement.removeChild(state.symbolElement.firstChild);
        }
        state.symbolElement.appendChild(svgElement);
    }

    function updateTextTitle() {
        if (state.routeName.length < 6) {
            if (maMap.getZoom() > 10) {
                if (state.symbolElement.childNodes.length < 2) {
                    state.symbolElement.appendChild(createTextTitleElement());
                }
            } else {
                if (state.symbolElement.childNodes.length > 1) {
                    state.symbolElement.removeChild(state.symbolElement.lastChild);
                }
            }
        }
    }

    function createTextTitleElement() {
        var textTitleElement = createSvgElement('g');
        if (state.symbolForm === 'arrow') {
            var backgroundElement = createSvgElement('circle');
            backgroundElement.setAttribute('cx', '5');
            backgroundElement.setAttribute('cy', '5');
            backgroundElement.setAttribute('r', '1.75');
            if (state.previousUpdateType === 'vp') {
                backgroundElement.setAttribute('stroke', 'white');
                backgroundElement.setAttribute('stroke-width', '0.5');
            }
            textTitleElement.appendChild(backgroundElement);
        }
        var textElement = createSvgElement('text');
        textElement.textContent = state.routeName;
        textElement.setAttribute('fill', 'white');
        textElement.setAttribute('font-size', getFontSize());
        textElement.setAttribute('text-anchor', 'middle');
        /* MSIE doesn't support dominant-baseline, let's hack vertical position with dy */
        textElement.setAttribute('dy', '0.3em');
        textElement.setAttribute('x', '5');
        textElement.setAttribute('y', '5');
        textTitleElement.appendChild(textElement);
        return textTitleElement;
    }

    function getFontSize() {
        if (state.routeName.length < 3) {
            return '2';
        } else if (state.routeName.length < 4) {
            return '1.75';
        } else {
            return '1.5';
        }
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
