import pyttsx3
import speech_recognition as sr
import eel


def speak(text):
    engine = pyttsx3.init('sapi5')
    voices = engine.getProperty("voices")
    engine.setProperty('rate', 170)
    engine.say(text)
    engine.runAndWait()


@eel.expose
def takeCommand():

    r = sr.Recognizer()

    with sr.Microphone() as source:
        print("listening...")
        eel.DisplayMessage("listening")
        r.pause_threshold = 1
        r.adjust_for_ambient_noise(source)

        audio = r.listen(source, 30, 30)

    try:
        print("recognizing...")
        eel.DisplayMessage("recognizing...")
        query = r.recognize_google(audio, language='en-au')
        print(f"user said: {query}")
        eel.DisplayMessage(query)
        speak(query)
        eel.ShowHood()
    except Exception as e:
        return ""

    return query.lower()


@eel.expose
def allCommand():

    query = takeCommand()
    print(query)
