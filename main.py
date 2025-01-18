"""
This module is the main file where all the codes come together.
"""

import os
import eel
from engine.features import *
from engine.command import *


eel.init("www")

playAssistantSound()

os.system("start msedge --app=http://localhost:8000/index.html")

eel.start("index.html", mode=None, host='localhost', block=True)

