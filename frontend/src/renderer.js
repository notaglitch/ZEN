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

    async function detectSilence(stream) {
        if (!audioContext) {
            audioContext = new AudioContext()
        }

        const analyser = audioContext.createAnalyser()
        const microphone = audioContext.createMediaStreamSource(stream)
        const scriptProcessor = audioContext.createScriptProcessor(2048, 1, 1)

        analyser.smoothingTimeConstant = 0.8
        analyser.fftSize = 2048

        microphone.connect(analyser)
        analyser.connect(scriptProcessor)
        scriptProcessor.connect(audioContext.destination)

        scriptProcessor.onaudioprocess = () => {
            const dataArray = new Uint8Array(analyser.frequencyBinCount)
            analyser.getByteFrequencyData(dataArray)
            const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length
            const volume = 20 * Math.log10(average / 255)  // Convert to dB

            if (volume < SILENCE_THRESHOLD) {
                if (!silenceStart) {
                    silenceStart = Date.now()
                } else if (Date.now() - silenceStart > SILENCE_DURATION) {
                    stopRecording()
                    microphone.disconnect()
                    scriptProcessor.disconnect()
                    analyser.disconnect()
                }
            } else {
                silenceStart = null
            }
        }
    }

    async function startRecording() {
        try {
            console.log('Requesting microphone access...')
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: true,
                video: false
            })
            console.log('Microphone access granted')

            mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            })
            audioChunks = []

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data)
            }

            mediaRecorder.onstop = async () => {
                if (audioChunks.length === 0) {
                    console.log('No audio recorded, restarting...')
                    startRecording()
                    return
                }

                console.log('Processing audio...')
                const audioBlob = new Blob(audioChunks, { 
                    type: 'audio/webm;codecs=opus'
                })
                
                try {
                    const arrayBuffer = await audioBlob.arrayBuffer()
                    const uint8Array = new Uint8Array(arrayBuffer)
                    
                    console.log('Sending audio to server...')
                    const response = await window.electronAPI.sendVoice(Array.from(uint8Array))
                    console.log('Server response:', response)
                    
                    if (response.error) {
                        console.error('Server error:', response.error)
                        addMessage(`Error: ${response.error}`)
                        startRecording()  // Restart recording even after error
                    } else {
                        addMessage(response.transcribed, true)
                        addMessage(response.response, false, response.message_id, response.has_audio)
                        // Recording will restart after audio playback ends
                    }
                } catch (error) {
                    console.error('Processing error:', error)
                    addMessage('Error: Failed to process voice message')
                    startRecording()  // Restart recording after error
                }
            }

            mediaRecorder.start()
            isRecording = true
            recordButton.classList.add('recording')
            voiceStatus.textContent = 'Listening...'
            
            // Start silence detection
            detectSilence(stream)
            
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