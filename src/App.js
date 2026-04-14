import React, { useRef, useEffect, useState } from "react";
import Webcam from "react-webcam";

// 1. ADDED "Thank You" to the target list!
const KNOWN_SIGNS = ["Peace", "Hello", "Pointing Up", "Fist", "A", "B", "L", "W", "Thank You"];

function App() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState(""); 
  const [gesture, setGesture] = useState("Waiting...");
  const [mode, setMode] = useState("Translate");
  const [targetSign, setTargetSign] = useState("Peace");
  const [score, setScore] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false); 

  const lastSpokenRef = useRef("");
  const modeRef = useRef("Translate");
  const targetSignRef = useRef("Peace");
  const scoreRef = useRef(0);
  const cooldownRef = useRef(false);
  
  // 2. NEW: THE MEMORY BUFFER
  // This stores the last 15 frames of your wrist's position
  const gestureHistoryRef = useRef([]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim()) return;

    try {
      const cleanUsername = encodeURIComponent(username.trim().toLowerCase());
      const response = await fetch(`https://handsign-backend-tqvf.onrender.com/api/score/${cleanUsername}`);
      const data = await response.json();
      
      setScore(data.highScore || 0);
      scoreRef.current = data.highScore || 0;
      setIsLoggedIn(true);
    } catch (err) {
      console.error("Backend error:", err);
      alert("Make sure you are connected to the internet!");
    }
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    modeRef.current = newMode;
    if (newMode === "Learn") pickNewSign();
  };

  const pickNewSign = () => {
    const randomSign = KNOWN_SIGNS[Math.floor(Math.random() * KNOWN_SIGNS.length)];
    setTargetSign(randomSign);
    targetSignRef.current = randomSign;
  };

  const isFingerUp = (landmarks, tipIdx, knuckleIdx) => landmarks[tipIdx].y < landmarks[knuckleIdx].y;
  const isThumbOut = (landmarks) => Math.abs(landmarks[4].x - landmarks[17].x) > Math.abs(landmarks[2].x - landmarks[17].x);

  // 3. NEW: UPGRADED AI LOGIC WITH MOTION TRACKING
  const labelGesture = (landmarks) => {
    const indexUp = isFingerUp(landmarks, 8, 6);
    const middleUp = isFingerUp(landmarks, 12, 10);
    const ringUp = isFingerUp(landmarks, 16, 14);
    const pinkyUp = isFingerUp(landmarks, 20, 18);
    const thumbOut = isThumbOut(landmarks);

    // Track the wrist (landmark 0)
    const wrist = landmarks[0];
    
    // Push current wrist position into memory
    gestureHistoryRef.current.push(wrist);
    
    // Keep memory to a maximum of 15 frames (about 0.5 seconds of video)
    if (gestureHistoryRef.current.length > 15) {
      gestureHistoryRef.current.shift(); 
    }

    // MOTION DETECTION: "Thank You"
    // ASL Thank You: Flat hand (all fingers up) moving down/forward from the face.
    const isFlatHand = indexUp && middleUp && ringUp && pinkyUp;
    
    if (isFlatHand && gestureHistoryRef.current.length === 15) {
      // Compare the wrist Y position from 15 frames ago to right now
      const startY = gestureHistoryRef.current[0].y;
      const currentY = gestureHistoryRef.current[14].y;
      
      // In MediaPipe, Y=0 is the top of the screen and Y=1 is the bottom.
      // If currentY is much larger than startY, the hand moved DOWN.
      const downwardMovement = currentY - startY;
      
      // If it moved down by more than 8% of the screen height, trigger the sign!
      if (downwardMovement > 0.08) {
        gestureHistoryRef.current = []; // Clear memory so it doesn't spam
        return "Thank You";
      }
    }

    // Static Dictionary
    if (indexUp && middleUp && !ringUp && !pinkyUp && !thumbOut) return "Peace";
    if (indexUp && middleUp && ringUp && pinkyUp && thumbOut) return "Hello";
    if (indexUp && !middleUp && !ringUp && !pinkyUp && !thumbOut) return "Pointing Up";
    if (!indexUp && !middleUp && !ringUp && !pinkyUp && thumbOut) return "A";
    if (indexUp && middleUp && ringUp && pinkyUp && !thumbOut) return "B";
    if (indexUp && !middleUp && !ringUp && !pinkyUp && thumbOut) return "L";
    if (indexUp && middleUp && ringUp && !pinkyUp) return "W";
    if (!indexUp && !middleUp && !ringUp && !pinkyUp && !thumbOut) return "Fist";
    
    return "Scanning...";
  };

  const speak = (text) => {
    if (text !== "Scanning..." && text !== "Waiting..." && text !== lastSpokenRef.current) {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
      lastSpokenRef.current = text;
    }
  };

  function onResults(results) {
    if (!webcamRef.current || !canvasRef.current) return;

    const canvasCtx = canvasRef.current.getContext("2d");
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      for (const landmarks of results.multiHandLandmarks) {
        window.drawConnectors(canvasCtx, landmarks, window.HAND_CONNECTIONS, { color: "#ffffff", lineWidth: 3 });
        window.drawLandmarks(canvasCtx, landmarks, { color: "#1cb0f6", lineWidth: 2, radius: 4 });

        const detected = labelGesture(landmarks);
        setGesture(detected);

        if (modeRef.current === "Translate") {
          speak(detected);
        } else if (modeRef.current === "Learn" && !cooldownRef.current) {
          if (detected === targetSignRef.current) {
            cooldownRef.current = true;
            scoreRef.current += 10; 
            setScore(scoreRef.current);
            setShowSuccess(true); 
            speak("Correct!");

            fetch("https://handsign-backend-tqvf.onrender.com/api/score", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ username, score: scoreRef.current })
            }).catch(console.error);
            
            setTimeout(() => {
              setShowSuccess(false);
              pickNewSign();
              cooldownRef.current = false;
            }, 2000);
          }
        }
      }
    } else {
      setGesture("No hand detected");
      lastSpokenRef.current = "";
      gestureHistoryRef.current = []; // Clear memory if hand leaves the screen
    }
    canvasCtx.restore();
  }

  useEffect(() => {
    if (!isLoggedIn || !window.Hands) return;
    let camera = null;
    const hands = new window.Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
    hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    hands.onResults(onResults);

    const startCamera = () => {
      if (webcamRef.current?.video?.readyState >= 2) {
        camera = new window.Camera(webcamRef.current.video, {
          onFrame: async () => { 
            if (webcamRef.current?.video) await hands.send({ image: webcamRef.current.video }); 
          },
          width: 640, height: 480,
        });
        camera.start();
      } else {
        setTimeout(startCamera, 250);
      }
    };
    startCamera();
    return () => { if (camera) camera.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]); 

  // --- STYLES ---
  const colors = { bg: "#131F24", card: "#202F36", primary: "#58CC02", text: "#FFFFFF", secondary: "#1CB0F6" };

  if (!isLoggedIn) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: colors.bg, color: colors.text, fontFamily: "'Nunito', sans-serif" }}>
        <div style={{ backgroundColor: colors.card, padding: "50px", borderRadius: "24px", textAlign: "center", boxShadow: "0px 8px 0px rgba(0,0,0,0.2)", width: "350px" }}>
          <h1 style={{ color: colors.primary, fontSize: "2.5rem", margin: "0 0 10px 0" }}>SignAI</h1>
          <p style={{ color: "#AFAFAF", marginBottom: "30px" }}>Master ASL with AI.</p>
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
            <input type="text" placeholder="Enter Username" value={username} onChange={(e) => setUsername(e.target.value)} style={{ padding: "15px", fontSize: "16px", borderRadius: "12px", border: "2px solid #37464F", backgroundColor: "#131F24", color: "white", outline: "none" }} autoFocus />
            <button type="submit" style={{ padding: "15px", fontSize: "18px", backgroundColor: colors.primary, color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", cursor: "pointer", boxShadow: "0px 4px 0px #58A700", textTransform: "uppercase", letterSpacing: "1px" }}>START</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minHeight: "100vh", backgroundColor: colors.bg, color: colors.text, fontFamily: "'Nunito', sans-serif", padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", maxWidth: "800px", marginBottom: "30px", backgroundColor: colors.card, padding: "15px 30px", borderRadius: "20px" }}>
        <h2 style={{ margin: 0, color: colors.primary }}>SignAI</h2>
        <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ color: "#AFAFAF", fontSize: "1rem" }}>{username}</span>
          <span style={{ color: "#FFC800", backgroundColor: "rgba(255, 200, 0, 0.1)", padding: "5px 15px", borderRadius: "10px" }}>⚡ {score} XP</span>
        </h3>
      </div>
      <div style={{ display: "flex", gap: "15px", marginBottom: "30px" }}>
        <button onClick={() => switchMode("Translate")} style={{ padding: "12px 25px", fontSize: "16px", cursor: "pointer", backgroundColor: mode === "Translate" ? colors.secondary : colors.card, color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", boxShadow: mode === "Translate" ? "0px 4px 0px #1899D6" : "0px 4px 0px rgba(0,0,0,0.2)" }}>Translate</button>
        <button onClick={() => switchMode("Learn")} style={{ padding: "12px 25px", fontSize: "16px", cursor: "pointer", backgroundColor: mode === "Learn" ? colors.primary : colors.card, color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", boxShadow: mode === "Learn" ? "0px 4px 0px #58A700" : "0px 4px 0px rgba(0,0,0,0.2)" }}>Learn</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "40px", width: "100%", maxWidth: "1000px" }}>
        <div style={{ position: "relative", borderRadius: "24px", overflow: "hidden", border: `6px solid ${showSuccess ? colors.primary : colors.card}`, transition: "border 0.3s ease", backgroundColor: "#000", width: "640px", height: "480px" }}>
          <Webcam ref={webcamRef} style={{ width: 640, height: 480, transform: "scaleX(-1)" }} mirrored={true} />
          <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: 640, height: 480, transform: "scaleX(-1)" }} />
          {showSuccess && (
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(88, 204, 2, 0.3)", display: "flex", justifyContent: "center", alignItems: "center" }}>
              <h1 style={{ color: "white", fontSize: "4rem", textShadow: "0px 4px 10px rgba(0,0,0,0.5)", margin: 0, backgroundColor: colors.primary, padding: "10px 40px", borderRadius: "20px", transform: "rotate(-5deg)" }}>CORRECT!</h1>
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", backgroundColor: colors.card, padding: "40px", borderRadius: "24px", minWidth: "300px", boxShadow: "0px 8px 0px rgba(0,0,0,0.2)" }}>
          {mode === "Translate" ? (
            <>
              <h3 style={{ margin: "0 0 20px 0", color: "#AFAFAF", textTransform: "uppercase", letterSpacing: "2px" }}>I see...</h3>
              <p style={{ fontSize: "3rem", fontWeight: "bold", margin: 0, color: colors.secondary }}>{gesture}</p>
            </>
          ) : (
            <>
              <h3 style={{ margin: "0 0 20px 0", color: "#AFAFAF", textTransform: "uppercase", letterSpacing: "2px" }}>Show me the sign for</h3>
              <p style={{ fontSize: "5rem", fontWeight: "bold", margin: 0, color: colors.primary, textAlign: "center" }}>{targetSign}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;