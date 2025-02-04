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

    function createAudioPlayer(messageId) {
        const audio = document.createElement('audio')
        audio.controls = true
        audio.src = `http://localhost:5000/audio/${messageId}`
        
        audio.onerror = (e) => {
            console.error('Audio error:', e)
            console.error('Audio src:', audio.src)
        }

        audio.onloadstart = () => {
            console.log('Audio started loading:', messageId)
        }

        audio.oncanplaythrough = () => {
            console.log('Audio ready to play:', messageId)
            audio.play().catch(error => {
                console.error('Auto-play failed:', error)
            })
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
                console.log('Data available from recorder')
                audioChunks.push(event.data)
            }

            mediaRecorder.onstop = async () => {
                console.log('Recording stopped, processing audio...')
                const audioBlob = new Blob(audioChunks, { 
                    type: 'audio/webm;codecs=opus'
                })
                voiceStatus.textContent = 'Processing...'
                
                try {
                    console.log('Converting audio data...')
                    const arrayBuffer = await audioBlob.arrayBuffer()
                    const uint8Array = new Uint8Array(arrayBuffer)
                    
                    console.log('Sending audio to server...')
                    const response = await window.electronAPI.sendVoice(Array.from(uint8Array))
                    console.log('Server response:', response)
                    
                    if (response.error) {
                        console.error('Server error:', response.error)
                        addMessage(`Error: ${response.error}`)
                    } else {
                        addMessage(response.transcribed, true)
                        addMessage(response.response, false, response.message_id, response.has_audio)
                    }
                } catch (error) {
                    console.error('Processing error:', error)
                    addMessage('Error: Failed to process voice message')
                }
                
                closeVoiceModal()
            }

            mediaRecorder.start()
            isRecording = true
            recordButton.classList.add('recording')
            voiceStatus.textContent = 'Recording... Click to stop'
            
        } catch (error) {
            console.error('Microphone access error:', error)
            voiceStatus.textContent = `Error: ${error.message || 'Could not access microphone'}`
            
            if (error.name === 'NotAllowedError') {
                voiceStatus.textContent = 'Please allow microphone access in your browser settings'
            } else if (error.name === 'NotFoundError') {
                voiceStatus.textContent = 'No microphone found'
            }
        }
    }

    function stopRecording() {
        if (mediaRecorder && isRecording) {
            console.log('Stopping recording...')
            mediaRecorder.stop()
            isRecording = false
            recordButton.classList.remove('recording')
            mediaRecorder.stream.getTracks().forEach(track => track.stop())
        }
    }

    function openVoiceModal() {
        voiceModal.style.display = 'block'
        voiceStatus.textContent = 'Click to start speaking'
    }

    function closeVoiceModal() {
        voiceModal.style.display = 'none'
        if (isRecording) {
            stopRecording()
        }
    }

    voiceButton.addEventListener('click', openVoiceModal)
    closeButton.addEventListener('click', closeVoiceModal)
    
    recordButton.addEventListener('click', () => {
        if (!isRecording) {
            startRecording()
        } else {
            stopRecording()
        }
    })
    
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