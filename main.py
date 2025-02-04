import ollama

def ask_ollama(prompt):
    response = ollama.chat(model="llama3.2", messages=[{"role": "user", "content": prompt}])
    return response['message']['content']

while True:
    prompt = input("Enter a prompt (or 'quit' to exit): ")
    if prompt.lower() == 'quit':
        break
    print(ask_ollama(prompt))