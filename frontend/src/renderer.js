document.addEventListener('DOMContentLoaded', () => {
    const messagesContainer = document.getElementById('chat-messages')
    const userInput = document.getElementById('user-input')
    const sendButton = document.getElementById('send-button')
    const voiceButton = document.getElementById('voice-button')
    const voiceModal = document.getElementById('voice-modal')
    const recordButton = document.getElementById('record-button')
    const closeButton = document.querySelector('.close-button')
    const voiceStatus = document.querySelector('.voice-status')
    
    let mediaRecorder = null
    let audioChunks = []
    let isRecording = false
    let silenceTimeout = null
    let audioContext = null
    let silenceStart = null
    const SILENCE_THRESHOLD = -50  // dB
    const SILENCE_DURATION = 1500  // ms
    let isProcessing = false
    let visualizer = null
    const VOICE_ACTIVATION_THRESHOLD = -45
    let lastActiveTime = Date.now()
    const ACTIVITY_TIMEOUT = 10000

    function createAudioPlayer(messageId) {
        const audio = document.createElement('audio')
        audio.controls = true
        audio.src = `http://localhost:5000/audio/${messageId}`
        audio.oncanplaythrough = () => {
            audio.play().catch(error => {
                console.error('Auto-play failed:', error)
            })
        }
        // When audio finishes playing, start listening again
        audio.onended = () => {
            if (voiceModal.style.display === 'block') {
                startRecording()
            }
        }
        return audio
    }

    function addMessage(content, isUser = false, messageId = null, hasAudio = false) {
        const messageDiv = document.createElement('div')
        messageDiv.className = `message ${isUser ? 'user-message' : 'assistant-message'}`
        
        const textDiv = document.createElement('div')
        textDiv.textContent = content
        messageDiv.appendChild(textDiv)
        
        if (messageId && hasAudio && !isUser) {
            const audioPlayer = createAudioPlayer(messageId)
            messageDiv.appendChild(audioPlayer)
        }
        
        messagesContainer.appendChild(messageDiv)
        messagesContainer.scrollTop = messagesContainer.scrollHeight
    }

    function setupVisualizer(stream) {
        if (!audioContext) {
            audioContext = new AudioContext()
        }

        const analyser = audioContext.createAnalyser()
        const microphone = audioContext.createMediaStreamSource(stream)
        analyser.fftSize = 256
        microphone.connect(analyser)

        const canvas = document.createElement('canvas')
        canvas.className = 'audio-visualizer'
        document.querySelector('.modal-body').insertBefore(canvas, recordButton)

        const canvasCtx = canvas.getContext('2d')
        const dataArray = new Uint8Array(analyser.frequencyBinCount)

        function draw() {
            if (!isRecording) return

            requestAnimationFrame(draw)
            analyser.getByteFrequencyData(dataArray)

            canvasCtx.fillStyle = '#2d2d2d'
            canvasCtx.fillRect(0, 0, canvas.width, canvas.height)

            const barWidth = (canvas.width / dataArray.length) * 2.5
            let barHeight
            let x = 0

            for (let i = 0; i < dataArray.length; i++) {
                barHeight = dataArray[i] / 2
                
                const gradient = canvasCtx.createLinearGradient(0, 0, 0, canvas.height)
                gradient.addColorStop(0, '#4a9eff')
                gradient.addColorStop(1, '#3a8eef')
                
                canvasCtx.fillStyle = isRecording ? gradient : '#666'
                canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight)

                x += barWidth + 1
            }
        }

        canvas.width = 300
        canvas.height = 100
        draw()
        return analyser
    }

    async function detectSilence(stream, analyser) {
        const microphone = audioContext.createMediaStreamSource(stream)
        const scriptProcessor = audioContext.createScriptProcessor(2048, 1, 1)

        analyser.smoothingTimeConstant = 0.8
        analyser.fftSize = 2048

        scriptProcessor.connect(audioContext.destination)

        scriptProcessor.onaudioprocess = () => {
            if (!isRecording || isProcessing) return

            const dataArray = new Uint8Array(analyser.frequencyBinCount)
            analyser.getByteFrequencyData(dataArray)
            const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length
            const volume = 20 * Math.log10(average / 255)

            if (volume > VOICE_ACTIVATION_THRESHOLD) {
                lastActiveTime = Date.now()
                voiceStatus.textContent = 'Listening...'
                recordButton.classList.add('active')
            } else {
                recordButton.classList.remove('active')
                
                const silenceDuration = Date.now() - lastActiveTime
                if (silenceDuration > SILENCE_DURATION && !isProcessing) {
                    stopRecording()
                } else if (silenceDuration > ACTIVITY_TIMEOUT) {
                    voiceStatus.textContent = 'Waiting for voice...'
                }
            }
        }

        return scriptProcessor
    }

    async function startRecording() {
        if (isProcessing) return

        try {
            console.log('Requesting microphone access...')
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            })

            mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            })
            audioChunks = []

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data)
            }

            mediaRecorder.onstop = async () => {
                if (audioChunks.length === 0 || isProcessing) {
                    startRecording()
                    return
                }

                isProcessing = true
                voiceStatus.textContent = 'Processing...'
                
                try {
                    const audioBlob = new Blob(audioChunks, { 
                        type: 'audio/webm;codecs=opus'
                    })
                    
                    const arrayBuffer = await audioBlob.arrayBuffer()
                    const uint8Array = new Uint8Array(arrayBuffer)
                    
                    const response = await window.electronAPI.sendVoice(Array.from(uint8Array))
                    
                    if (response.error) {
                        console.error('Server error:', response.error)
                        voiceStatus.textContent = 'Error occurred. Click to try again.'
                    } else {
                        if (response.transcribed) {
                            addMessage(response.transcribed, true)
                        }
                        addMessage(response.response, false, response.message_id, response.has_audio)
                    }
                } catch (error) {
                    console.error('Processing error:', error)
                    voiceStatus.textContent = 'Error occurred. Click to try again.'
                } finally {
                    isProcessing = false
                    if (voiceModal.style.display === 'block' && response?.should_restart) {
                        setTimeout(startRecording, 100)
                    }
                }
            }

            visualizer = setupVisualizer(stream)
            const processor = await detectSilence(stream, visualizer)

            mediaRecorder.start(1000)
            isRecording = true
            recordButton.classList.add('recording')
            voiceStatus.textContent = 'Listening...'
            lastActiveTime = Date.now()
            
        } catch (error) {
            console.error('Microphone access error:', error)
            voiceStatus.textContent = `Error: ${error.message || 'Could not access microphone'}`
        }
    }

    function stopRecording() {
        if (mediaRecorder && isRecording) {
            console.log('Stopping recording...')
            mediaRecorder.stop()
            isRecording = false
            recordButton.classList.remove('recording')
            voiceStatus.textContent = 'Processing...'
            mediaRecorder.stream.getTracks().forEach(track => track.stop())
        }
    }

    function openVoiceModal() {
        voiceModal.style.display = 'block'
        voiceStatus.textContent = 'Click to start conversation'
        recordButton.classList.remove('recording')
    }

    function closeVoiceModal() {
        voiceModal.style.display = 'none'
        if (isRecording) {
            stopRecording()
        }
        if (audioContext) {
            audioContext.close()
            audioContext = null
        }
    }

    // Event Listeners
    voiceButton.addEventListener('click', openVoiceModal)
    closeButton.addEventListener('click', closeVoiceModal)
    
    recordButton.addEventListener('click', () => {
        if (!isRecording) {
            startRecording()
        } else {
            stopRecording()
        }
    })

    // Close modal if clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === voiceModal) {
            closeVoiceModal()
        }
    })

    async function handleSendMessage() {
        const message = userInput.value.trim()
        if (!message) return

        userInput.disabled = true
        sendButton.disabled = true

        try {
            addMessage(message, true)
            userInput.value = ''

            const response = await window.electronAPI.sendMessage(message)
            if (response.error) {
                addMessage(`Error: ${response.error}`)
            } else {
                addMessage(response.response, false)
            }
        } catch (error) {
            console.error('Send message error:', error)
            addMessage('Error: Failed to send message')
        } finally {
            userInput.disabled = false
            sendButton.disabled = false
            userInput.focus()
        }
    }

    sendButton.addEventListener('click', handleSendMessage)
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSendMessage()
        }
    })
})