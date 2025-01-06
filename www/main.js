$(document).ready(function () {
  $(".text").textillate({
    loop: true,
    sync: true,
    in: {
      effect: "bounceIn",
    },
    out: {
      effect: "bounceOut",
    },
  });
  // Siri message animation
  $(".siri-message").textillate({
    loop: true,
    sync: true,
    in: {
      effect: "fadeInUp",
      sync: true,
    },
    out: {
      effect: "fadeOutUp",
      sync: true,
    },
  });
  // Siri waves
  var siriWave = new SiriWave({
    container: document.getElementById("siri-container"),
    width: 800,
    height: 200,
    style: "ios9",
    amplitude: "1",
    speed: "0.25",
    autostart: true,
  });

  // Mic button click event

  $("#MicBtn").click(function (e) {
    eel.playAssistantSound();
    $("#Oval").attr("hidden", true);
    $("#SiriWaves").attr("hidden", false);
    eel.allCommand()();
  });
});
