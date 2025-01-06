""" 
For the features
"""
from playsound import playsound as ps
import eel

# For playing


@eel.expose
def playAssistantSound():
    music_dir = r"assets\\audios\\start_sound.mp3"
    ps(music_dir)
