document.addEventListener('DOMContentLoaded', () => {
    const messagesContainer = document.getElementById('chat-messages')
    const userInput = document.getElementById('user-input')
    const sendButton = document.getElementById('send-button')

    function createAudioPlayer(messageId) {
        const audio = document.createElement('audio')
        audio.controls = true
        audio.src = `http://localhost:5000/audio/${messageId}`
        
        // Add error handling for audio
        audio.onerror = (e) => {
            console.error('Audio error:', e)
            console.error('Audio src:', audio.src)
        }

        // Add loading event
        audio.onloadstart = () => {
            console.log('Audio started loading:', messageId)
        }

        // Add ready event
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
        
        // Add text content
        const textDiv = document.createElement('div')
        textDiv.textContent = content
        messageDiv.appendChild(textDiv)
        
        // Add audio player if available
        if (messageId && hasAudio && !isUser) {
            console.log('Creating audio player for message:', messageId)
            const audioPlayer = createAudioPlayer(messageId)
            messageDiv.appendChild(audioPlayer)
        }
        
        messagesContainer.appendChild(messageDiv)
        messagesContainer.scrollTop = messagesContainer.scrollHeight
    }

    async function handleSendMessage() {
        const message = userInput.value.trim()
        if (!message) return

        userInput.disabled = true
        sendButton.disabled = true

        try {
            addMessage(message, true)
            userInput.value = ''

            const response = await window.electronAPI.sendMessage(message)
            console.log('Got response:', response)  // Debug log
            
            if (response.error) {
                addMessage(`Error: ${response.error}`)
            } else {
                addMessage(
                    response.response, 
                    false, 
                    response.message_id,
                    response.has_audio
                )
            }
        } catch (error) {
            console.error('Send message error:', error)  // Debug log
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