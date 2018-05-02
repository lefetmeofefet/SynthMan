let processor;
let Sounds = {
    SampleRate: 0,
    hookMicrophoneProcessor: function(processSampleCallback, sampleBufferSize, inputChannels, outputChannels) {
        navigator.mediaDevices.getUserMedia({audio: true, video: false})
            .then((stream) => {
                let context = new AudioContext();
                Sounds.SampleRate = context.sampleRate;
                let input;

                processor = context.createScriptProcessor(sampleBufferSize, inputChannels, outputChannels);

                if (inputChannels) {
                    input = context.createMediaStreamSource(stream);
                    input.connect(processor);
                }
                processor.connect(context.destination);

                console.log("BufferSize: ", processor.bufferSize);
                console.log("Channel Count: ", processor.channelCount);
                console.log("Input Channels: ", processor.numberOfInputs);
                console.log("Output Channels: ", processor.numberOfOutputs);

                processor.onaudioprocess = function (e) {
                    let inputBuffer = e.inputBuffer;
                    let outputBuffer = e.outputBuffer;

                    // Loop through the output channels (in this case there is only one)
                    for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
                        let inputData = [];
                        if (inputBuffer) {
                            inputData = inputBuffer.getChannelData(channel);
                        }
                        let outputData = outputBuffer.getChannelData(channel);

                        // Loop through the samples
                        for (let sample = 0; sample < (inputBuffer || outputBuffer).length; sample++) {
                            // make output equal to the same as the input
                            outputData[sample] = processSampleCallback(inputData[sample], channel);
                        }
                    }
                };
            });
    }
};


