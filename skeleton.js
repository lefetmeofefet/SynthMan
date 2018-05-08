let _drawingCanvasContext;
let _recordingCanvas;
let _recordingCanvasContext;
let _testingCanvasContext;
let _backgroundCanvasContext;
let _width;
let _height;

let _oldPixels;
let _oldData;
let _graph;
let _graphAccumulator;
let _graphHistory;
let _recentMax = 0;
let _recentMin = 0;

let _changesMaxXValueHistory = [];
let _changesMinXValueHistory = [];
let _graphCallback;
// let _BINARY_DIFF_THRESHOLD = 4;
// let _MIN_PIXEL_GROUP_SIZE = 4;
// let _BOX_BLURS = 2;

// Good for 320 x 240
// let _BINARY_DIFF_THRESHOLD = 4;
// let _MIN_PIXEL_GROUP_SIZE = 40;
// let _BOX_BLURS = 7;

// let _BINARY_DIFF_THRESHOLD = 4;
let _BINARY_DIFF_THRESHOLD = 3;
// let _MIN_PIXEL_GROUP_SIZE = 40;
let _MIN_PIXEL_GROUP_SIZE = 20;
let _BOX_BLURS = 7;
let _GRAPH_BLURRING_RADIUS = 20;
// let _BOX_BLURS = 0;
let _BLUR_RADIUS = 5;
let _SHAPE_BOUNDS_HISTORY_SIZE = 5;
let _GRAPH_MAKING_ALGORITHM = "outline"; // outline or median





// BACKGROUND CALBRATION METHOD
let _backgroundImage;
let _backgroundImageDiffsHistory;

function detectSkeleton(dimensions, videoTag, skeletonCanvas, testingCanvas, backgroundCanvas, graphCallback, interval = 100) {
    _graphCallback = graphCallback;
    _width = dimensions.width;
    _height = dimensions.height;

    _backgroundImage = new Array2D(_width, _height);
    _backgroundImageDiffsHistory = new Array2D(_width, _height);
    for (let y = 0; y < _height; y++) {
        for (let x = 0; x < _width; x++) {
            _backgroundImage.set(x, y, {r:0, g:0, b:0});
            _backgroundImageDiffsHistory.set(x, y, {
                numOfEqualDiffs: 0,
                lastDiff: 0
            })
        }
    }

    _graph = new Array(_width).fill(0);
    _graphAccumulator = new Array(_width).fill(0);
    _graphHistory = new Array(_width).fill(0);

    _drawingCanvasContext = skeletonCanvas.getContext('2d');
    _testingCanvasContext = testingCanvas.getContext('2d');
    _backgroundCanvasContext = backgroundCanvas.getContext('2d');

    _recordingCanvas = document.createElement('canvas');
    _recordingCanvas.setAttribute("width", _width.toString());
    _recordingCanvas.setAttribute("height", _height.toString());
    _recordingCanvasContext = _recordingCanvas.getContext('2d');

    const constraints = {
        audio: false,
        video: {width: _width, height: _height}
    };

    navigator.mediaDevices.getUserMedia(constraints)
        .then((stream) => {
            videoTag.srcObject = stream;
        });


    _oldPixels = _getPixelData();
    setInterval(() => {
        _recordingCanvasContext.drawImage(videoTag, 0, 0, _recordingCanvas.width, _recordingCanvas.height);
        try {
            _updateSkeleton()
        }
        catch (e) {
            if (e === "byebye") {
                console.log("Million pixels in my screen :(")
            }
            else {
                throw e;
            }
        }
    }, interval);
}

function _updateSkeleton() {
    let pixels = _getPixelData();
    let diff = _createDiff(_oldPixels, pixels);
    _oldPixels = pixels;
    // let diff = _createBlurredDiffBetweenImageDatas();

    let skeleton = _createSkeletonFromDiff(diff);
    _drawGreyscale(skeleton);
}
//
// function _updateSkeleton() {
//     let currentImage = _getPixelData();
//     let diff = _createDiff(_backgroundImage, currentImage);
//     _updateBackgroundImage(diff, currentImage);
//
//     let skeleton = _createSkeletonFromDiff(diff);
//     _drawGreyscale(skeleton);
// }

let _frame = 0;
function _updateBackgroundImage(diff, newImage) {
    _frame += 1;

    let MAX_FRAMES_WITH_DIFF = 30;
    let MAX_DIFF_TO_ALLOW_INTO_BACKGROUND = _BINARY_DIFF_THRESHOLD;
    let MOVING_BODY_MIN_DIFF = 100; // Higher = moving objects in the same area will be backgrounded,
                                    // Lower =
    for (let y = 0; y < _height; y++) {
        for (let x = 0; x < _width; x++) {
            let currentDiff = diff.get(x, y);
            if (currentDiff > MAX_DIFF_TO_ALLOW_INTO_BACKGROUND) {
                let diffsHistory = _backgroundImageDiffsHistory.get(x, y);
                // If lastDiff is equal to the current diff, increment the count and finally blend pixel into background
                if (Math.abs(currentDiff - diffsHistory.lastDiff) <= MOVING_BODY_MIN_DIFF || diffsHistory.numOfEqualDiffs === 0){
                    diffsHistory.numOfEqualDiffs += 1;
                    diffsHistory.lastDiff = currentDiff;
                    if (diffsHistory.numOfEqualDiffs >= MAX_FRAMES_WITH_DIFF){
                        _backgroundImage.set(x, y, newImage.get(x, y));
                        diffsHistory.numOfEqualDiffs = 0;
                        diffsHistory.lastDiff = 0;
                    }
                }
                else {
                    // Two different diffs in a row - assume moving body and do nothing
                    diffsHistory.numOfEqualDiffs = 0;
                }
            }
            else {
                // Current pixel equal to background -  do nothing
                _backgroundImageDiffsHistory.get(x, y).numOfEqualDiffs = 0;
            }
        }
    }
    _drawColored(_backgroundImage);
}

function _createBlurredDiffBetweenImageDatas() {
    let newData = _recordingCanvasContext.getImageData(0, 0, _width, _height).data;
    let blurredData = new Array(_oldData.length);
    let index;
    let dr, dg, db, greyscale;
    for (let y = 0; y < _height; y++) {
        let rowAddition = y * _width;
        for (let x = 0; x < _width; x++) {
            // Inverting the X to make mirror view instead of camera view
            index = 4 * (rowAddition + x);
            dr = Math.abs(_oldData[index] - newData[index]);
            dg = Math.abs(_oldData[index + 1] - newData[index + 1]);
            db = Math.abs(_oldData[index + 2] - newData[index + 2]);
            greyscale = (dr + dg + db) / 3;
            blurredData[index] = 255;
            blurredData[index + 1] = greyscale;
            blurredData[index + 2] = greyscale;
            blurredData[index + 3] = 255;
        }
    }
    _oldData = newData;
    blurredData = processImageDataRGB({
        data: blurredData
    }, 0, 0, _width, _height, _BLUR_RADIUS).data;
    return _getGreyscalePixelData(blurredData);
}

function _getGreyscalePixelData(data) {
    let pixels = new Array2D(_width, _height);

    for (let y = 0; y < _height; y++) {
        let rowAddition = y * _width;
        for (let x = 0; x < _width; x++) {
            pixels.set(_width - x - 1, y, data[4 * (rowAddition + x) + 2]);
        }
    }
    return pixels;
}

function _getPixelData() {
    let pixels = new Array2D(_width, _height);

    let pixelData = _recordingCanvasContext.getImageData(0, 0, _width, _height);
    let data = pixelData.data;
    for (let y = 0; y < _height; y++) {
        let rowAddition = y * _width;
        for (let x = 0; x < _width; x++) {
            // Inverting the X to make mirror view instead of camera view
            pixels.set(_width - x - 1, y, {
                r: data[4 * (rowAddition + x)],
                g: data[4 * (rowAddition + x) + 1],
                b: data[4 * (rowAddition + x) + 2],
                a: data[4 * (rowAddition + x) + 3]
            });
        }
    }
    return pixels;
}

function _createDiff(oldPixels, newPixels) {
    let diff = new Array2D(_width, _height);
    let newPixel;
    let oldPixel;
    let dr, dg, db;
    for (let x = 0; x < _width; x++) {
        for (let y = 0; y < _height; y++) {
            newPixel = newPixels.get(x, y);
            oldPixel = oldPixels.get(x, y);
            dr = Math.abs(newPixel.r - oldPixel.r);
            dg = Math.abs(newPixel.g - oldPixel.g);
            db = Math.abs(newPixel.b - oldPixel.b);
            // let dist = Math.sqrt(rd * rd + rg * rg + rb * rb);
            // let dist = Math.sqrt(dr*dr + dg*dg + db*db) / 1.7320508075688774;
            // let dist = Math.sqrt((dr*dr + dg*dg + db*db)/3);
            let dist = (dr + dg + db) / 3;
            diff.set(x, y, dist);
        }
    }
    return diff;
}

function _createSkeletonFromDiff(diff) {
    for (let i = 0; i < _BOX_BLURS; i++) {
        diff = _boxBlurFilter(diff);
    }
    let filteredDiff = diff;
    filteredDiff = _binaryFilter(filteredDiff, _BINARY_DIFF_THRESHOLD);
    filteredDiff = _thinFilter(filteredDiff);
    filteredDiff = _noiseCancelingFilter(filteredDiff, _MIN_PIXEL_GROUP_SIZE, 127, 255, 0, "green");

    // Setting skeleton highlight image for debugging.
    // TODO: remove later
    let skeletonHighlight = new Array2D(_width, _height);
    let numChangedPixels = 0;
    for (let x = 0; x < _width; x++) {
        for (let y = 0; y < _height; y++) {
            let value = filteredDiff.get(x, y);
            if (value > 127) {
                numChangedPixels += 1;
            }
            skeletonHighlight.set(x, y, value ? value : diff.get(x, y));
        }
    }
    if (numChangedPixels > _width * _height * 0.8) {
        throw "byebye";
    }

    let maxX = -1;
    let minX = Number.POSITIVE_INFINITY;
    for (let x = 0; x < _width; x++) {
        _graphAccumulator[x] = 0;
        let changedPixelsCount = 0;
        let minY = Number.POSITIVE_INFINITY;
        for (let y = 0; y < _height; y++) {
            if (filteredDiff.get(x, y) > 0) {
                _graphAccumulator[x] += y;
                changedPixelsCount += 1;
                if (_GRAPH_MAKING_ALGORITHM === "outline") {
                    if (y < minY) {
                        minY = y;
                    }
                }
            }
        }
        if (changedPixelsCount > 0) {
            if (x > maxX) {
                maxX = x;
            }
            if (x < minX) {
                minX = x;
            }

            // TODO: Test with outline
            let finalValue;
            if (_GRAPH_MAKING_ALGORITHM === "outline") {
                finalValue = Math.min(minY);
            }
            else if (_GRAPH_MAKING_ALGORITHM === "median") {
                finalValue = _graphAccumulator[x] / changedPixelsCount - changedPixelsCount / 3;
            }

            let changedPixelsPercentage = Math.sqrt(changedPixelsCount / _height);
            _graph[x] = (1 - changedPixelsPercentage) * _graph[x] + changedPixelsPercentage * finalValue;
            skeletonHighlight.set(x, finalValue, "red");
        }
    }

    // Clear changes that are not body.
    // First make sure that you don't erase the body when hands stop moving - doing this by only changing bounds if they've changed for long
    if (minX <= _width && maxX >= 0) {
        _changesMaxXValueHistory.unshift(maxX);
        _changesMinXValueHistory.unshift(minX);
        _recentMax = Math.max(..._changesMaxXValueHistory);
        _recentMin = Math.min(..._changesMinXValueHistory);

        for (let x = 0; x < _recentMin; x++) {
            _graph[x] = _height;
        }
        for (let x = _recentMax; x < _width; x++) {
            _graph[x] = _height;
        }

        if (_changesMaxXValueHistory.length === _SHAPE_BOUNDS_HISTORY_SIZE) {
            _changesMaxXValueHistory.pop();
        }
        if (_changesMinXValueHistory.length === _SHAPE_BOUNDS_HISTORY_SIZE) {
            _changesMinXValueHistory.pop();
        }
    }

    // TODO: Consider filling unchanged pixels with value between closest changed pixels

    let graph = _buildGraph(_graph, _recentMin, _recentMax);
    _drawGraph(graph, _recentMin, _recentMax);
    graph = _normalizeGraph(graph, 1, -1);
    _graphCallback(graph);

    return skeletonHighlight;
}

function _normalizeGraph(graph, upperBound = 1, lowerBound = 0) {
    let max = Number.NEGATIVE_INFINITY;
    let min = Number.POSITIVE_INFINITY;
    for (let i = 0; i < graph.length; i++) {
        if (graph[i] < min) {
            min = graph[i];
        }
        else if (graph[i] > max) {
            max = graph[i];
        }
    }
    for (let i = 0; i < graph.length; i++) {
        graph[i] = ((graph[i] - min) / (max - min)) * (upperBound - lowerBound) + lowerBound;
    }
    return graph;
}

function _boxBlurFilter(image) {
    // TODO: Improve performance
    let filtered = new Array2D(_width, _height);
    for (let x = 1; x < _width - 1; x++) {
        for (let y = 1; y < _height - 1; y++) {
            filtered.set(x, y, (
                image.get(x, y) +
                image.get(x + 1, y) +
                image.get(x + 1, y - 1) +
                image.get(x + 1, y + 1) +
                image.get(x, y + 1) +
                image.get(x, y - 1) +
                image.get(x - 1, y) +
                image.get(x - 1, y - 1) +
                image.get(x - 1, y + 1)
            ) / 9);
        }
    }
    // Edges without 8 surrounding pixels
    for (let x = 1; x < _width - 1; x++) {
        filtered.set(x, 0, (
            image.get(x + 1, 0) +
            image.get(x - 1, 0) +
            image.get(x + 1, 1) +
            image.get(x - 1, 1) +
            image.get(x, 1)
        ) / 6);

        filtered.set(x, _height - 1, (
            image.get(x + 1, _height - 1) +
            image.get(x - 1, _height - 1) +
            image.get(x + 1, _height - 2) +
            image.get(x - 1, _height - 2) +
            image.get(x, _height - 2)
        ) / 6);
    }

    for (let y = 1; y < _height - 1; y++) {
        filtered.set(0, y, (
            image.get(0, y + 1) +
            image.get(0, y - 1) +
            image.get(1, y + 1) +
            image.get(1, y - 1) +
            image.get(1, y)
        ) / 6);

        filtered.set(_width - 1, y, (
            image.get(_width - 1, y + 1) +
            image.get(_width - 1, y - 1) +
            image.get(_width - 2, y + 1) +
            image.get(_width - 2, y - 1) +
            image.get(_width - 2, y)
        ) / 6);
    }

    filtered.set(0, 0, (image.get(0, 1) + image.get(1, 0) + image.get(1, 1)) / 4);
    filtered.set(_width - 1, 0, (image.get(_width - 1, 1) + image.get(_width - 2, 0) + image.get(_width - 2, 1)) / 4);
    filtered.set(0, _height - 1, (image.get(0, _height - 2) + image.get(1, _height - 1) + image.get(1, _height - 2)) / 4);
    filtered.set(_width - 1, _height - 1, (image.get(_width - 1, _height - 2) + image.get(_width - 2, _height - 1) + image.get(_width - 2, _height - 2)) / 4);
    return filtered;
}

function _thinFilter(image, edgeThreshold = 127, high = 255, low = 0) {
    let filtered = new Array2D(_width, _height);
    for (let x = 0; x < _width; x++) {
        for (let y = 0; y < _height; y++) {
            if (image.get(x, y) <= edgeThreshold ||
                image.get(x + 1, y) <= edgeThreshold ||
                image.get(x + 1, y - 1) <= edgeThreshold ||
                image.get(x + 1, y + 1) <= edgeThreshold ||
                image.get(x, y + 1) <= edgeThreshold ||
                image.get(x, y - 1) <= edgeThreshold ||
                image.get(x - 1, y) <= edgeThreshold ||
                image.get(x - 1, y - 1) <= edgeThreshold ||
                image.get(x - 1, y + 1) <= edgeThreshold
            ) {
                filtered.set(x, y, low);
            }
            else {
                filtered.set(x, y, high);
            }
        }
    }
    return filtered;
}

function _noiseCancelingFilter(image, groupMinSize, groupOpacityThreshold = 127, high = 255, low = 0, noiseValue = 0) {
    let UNEVALUATED = -2, CURRENTLY_EVALUATING = -1;
    let filtered = new Array2D(_width, _height, UNEVALUATED);

    for (let x = 0; x < _width; x++) {
        for (let y = 0; y < _height; y++) {
            // On each unevaluated pixel, count the group he's in and decide if it's large enough.
            let currentPixStatus = filtered.get(x, y);
            let currentPix = image.get(x, y);
            if (currentPixStatus === UNEVALUATED) {
                if (currentPix >= groupOpacityThreshold) {
                    let group = [];
                    let currentLayer = [];
                    let lastLayer = [
                        [x, y]
                    ];
                    while (true) {
                        for (let pixLocation of lastLayer) {
                            let nextLocations = [
                                [pixLocation[0] + 1, pixLocation[1] + 1],
                                [pixLocation[0] - 1, pixLocation[1] + 1],
                                [pixLocation[0] + 1, pixLocation[1] - 1],
                                [pixLocation[0] - 1, pixLocation[1] - 1]
                            ];
                            for (let nextLocation of nextLocations) {
                                if (nextLocation[0] != null && nextLocation[1] != null) {
                                    let loopingPixStatus = filtered.get(nextLocation[0], nextLocation[1]);
                                    let loopingPix = image.get(nextLocation[0], nextLocation[1]);
                                    if (loopingPixStatus === UNEVALUATED) {
                                        if (loopingPix >= groupOpacityThreshold) {
                                            filtered.set(nextLocation[0], nextLocation[1], CURRENTLY_EVALUATING);
                                            currentLayer.push(nextLocation);
                                            group.push(nextLocation);
                                        }
                                        else {
                                            filtered.set(nextLocation[0], nextLocation[1], low)
                                        }
                                    }
                                }
                            }
                        }
                        if (currentLayer.length === 0) {
                            break;
                        }
                        lastLayer = currentLayer;
                        currentLayer = [];
                    }

                    if (group.length >= groupMinSize) {
                        for (let pixLocation of group) {
                            filtered.set(pixLocation[0], pixLocation[1], high);
                        }
                    }
                    else {
                        for (let pixLocation of group) {
                            filtered.set(pixLocation[0], pixLocation[1], noiseValue);
                        }
                    }
                }
                else {
                    filtered.set(x, y, low)
                }
            }
        }
    }
    return filtered;
}

function _binaryFilter(image, threshold, high = 255, low = 0) {
    let filtered = new Array2D(_width, _height);
    for (let x = 0; x < _width; x++) {
        for (let y = 0; y < _height; y++) {
            filtered.set(x, y, image.get(x, y) >= threshold ? high : low);
        }
    }
    return filtered
}

function _buildGraph(graph, minX, maxX) {
    let blurredGraph = new Array(maxX - minX);
    graph = graph.slice(minX, maxX);

    // Gaussian approximation blur
    for (let iteration = 0; iteration < _GRAPH_BLURRING_RADIUS; iteration++) {
        blurredGraph[0] = (graph[graph.length - 1] + graph[0] + graph[1]) / 3;
        blurredGraph[blurredGraph.length - 1] = (graph[0] + graph[graph.length - 1] + graph[graph.length - 2]) / 3;
        for (let i = 1; i < graph.length - 1; i++) {
            blurredGraph[i] = (graph[i] + graph[i + 1] + graph[i - 1]) / 3;
        }
        graph = blurredGraph;
    }
    return graph;
}

function _drawGraph(graph) {
    _testingCanvasContext.clearRect(0, 0, _width, _height);

    _testingCanvasContext.beginPath();
    _testingCanvasContext.strokeStyle="#eeeeee";
    _testingCanvasContext.lineWidth=2;
    _testingCanvasContext.moveTo(0, graph[0]);
    for (let i = 1; i < _width; i++) {
        _testingCanvasContext.lineTo(i, graph[i]);
    }
    _testingCanvasContext.stroke();
}

function _drawGreyscale(pixels) {
    let newImageData = _drawingCanvasContext.createImageData(_width, _height);
    let data = newImageData.data;
    let index;
    let darkness;
    for (let y = 0; y < _height; y++) {
        let rowAddition = _width * y;
        for (let x = 0; x < _width; x++) {
            index = 4 * (rowAddition + x);
            darkness = pixels.get(x, y);
            if (darkness === "red") {
                data[index] = 255;
                data[index + 1] = 0;
                data[index + 2] = 0;
            }
            else if (darkness === "green") {
                data[index] = 0;
                data[index + 1] = 255;
                data[index + 2] = 0;
            }
            else {
                data[index] = darkness;
                data[index + 1] = darkness;
                data[index + 2] = darkness;
            }

            data[index + 3] = 255;
        }
    }

    _drawingCanvasContext.putImageData(newImageData, 0, 0);
}


function _drawColored(pixels) {
    let newImageData = _backgroundCanvasContext.createImageData(_width, _height);
    let data = newImageData.data;
    let index;
    let pix;
    for (let y = 0; y < _height; y++) {
        let rowAddition = _width * y;
        for (let x = 0; x < _width; x++) {
            index = 4 * (rowAddition + x);
            pix = pixels.get(x, y);
            data[index] = pix.r;
            data[index + 1] = pix.g;
            data[index + 2] = pix.b;


            data[index + 3] = 255;
        }
    }

    _backgroundCanvasContext.putImageData(newImageData, 0, 0);
}