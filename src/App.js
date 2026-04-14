import React, { useRef, useEffect, useState } from "react";
import Webcam from "react-webcam";

// 1. FULL LIST OF SIGNS
const KNOWN_SIGNS = [
  "Peace", "Hello", "Pointing Up", "Fist", 
  "A", "L", "W", "Thank You", 
  "I Love You", "OK", "Call Me"
];

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
  
  const gestureHistoryRef = useRef([]); // For Motion signs
  const consecutiveSignRef = useRef({ sign: "", count: 0 }); // For Stabilizer
  const lockedGestureRef = useRef("Waiting..."); 

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
    let nextSign;
    do {
      nextSign = KNOWN_SIGNS[Math.floor(Math.random() * KNOWN_SIGNS.length)];
    } while (nextSign === targetSignRef.current);
    setTargetSign(nextSign);
    targetSignRef.current = nextSign;
  };

  // --- MATH HELPERS ---
  const isFingerUp = (landmarks, tipIdx, knuckleIdx) => landmarks[tipIdx].y < landmarks[knuckleIdx].y;
  const isThumbOut = (landmarks) => Math.abs(landmarks[4].x - landmarks[17].x) > Math.abs(landmarks[2].x - landmarks[17].x);
  const getDistance = (p1, p2) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

  // --- AI LOGIC ---
  const labelGesture = (landmarks) => {
    const indexUp = isFingerUp(landmarks, 8, 6);
    const middleUp = isFingerUp(landmarks, 12, 10);
    const ringUp = isFingerUp(landmarks, 16, 14);
    const pinkyUp = isFingerUp(landmarks, 20, 18);
    const thumbOut = isThumbOut(landmarks);
    const distThumbIndex = getDistance(landmarks[4], landmarks[8]);

    // Motion Buffer
    gestureHistoryRef.current.push(landmarks[0]);
    if (gestureHistoryRef.current.length > 15) gestureHistoryRef.current.shift();

    // 1. Thank You (Motion)
    if (indexUp && middleUp && ringUp && pinkyUp && gestureHistoryRef.current.length === 15) {
      const move = gestureHistoryRef.current[14].y - gestureHistoryRef.current[0].y;
      if (move > 0.08) { gestureHistoryRef.current = []; return "Thank You"; }
    }

    // 2. New Signs
    if (distThumbIndex < 0.10 && middleUp && ringUp && pinkyUp) return "OK";
    if (indexUp && !middleUp && !ringUp && pinkyUp && thumbOut) return "I Love You";
    if (!indexUp && !middleUp && !ringUp && pinkyUp && thumbOut) return "Call Me";

    // 3. Static Signs
    if (indexUp && middleUp && !ringUp && !pinkyUp && !thumbOut) return "Peace";
    if (indexUp && middleUp && ringUp && pinkyUp && thumbOut) return "Hello";
    if (indexUp && !middleUp && !ringUp && !pinkyUp && !thumbOut) return "Pointing Up";
    if (!indexUp && !middleUp && !ringUp && !pinkyUp && thumbOut) return "A";
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
    const ctx = canvasRef.current.getContext("2d");
    ctx.save();
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    ctx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      for (const landmarks of results.multiHandLandmarks) {
        window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, { color: "#FFF", lineWidth: 3 });
        window.drawLandmarks(ctx, landmarks, { color: "#1CB0F6", lineWidth: 2, radius: 4 });

        const raw = labelGesture(landmarks);
        if (raw === "Thank You") {
          lockedGestureRef.current = "Thank You";
        } else if (raw !== "Scanning...") {
          if (raw === consecutiveSignRef.current.sign) {
            consecutiveSignRef.current.count++;
          } else {
            consecutiveSignRef.current = { sign: raw, count: 1 };
          }
          if (consecutiveSignRef.current.count >= 15) lockedGestureRef.current = raw;
        }
        setGesture(lockedGestureRef.current);

        if (modeRef.current === "Translate") speak(lockedGestureRef.current);
        else if (modeRef.current === "Learn" && !cooldownRef.current && lockedGestureRef.current === targetSignRef.current) {
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
            lockedGestureRef.current = "Waiting...";
            cooldownRef.current = false;
          }, 2000);
        }
      }
    } else {
      setGesture("No hand detected");
      lockedGestureRef.current = "Waiting...";
      consecutiveSignRef.current.count = 0;
    }
    ctx.restore();
  }

  useEffect(() => {
    if (!isLoggedIn || !window.Hands) return;
    const hands = new window.Hands({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
    hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    hands.onResults(onResults);
    let camera = null;
    const startCamera = () => {
      if (webcamRef.current?.video?.readyState >= 2) {
        camera = new window.Camera(webcamRef.current.video, {
          onFrame: async () => { if (webcamRef.current?.video) await hands.send({ image: webcamRef.current.video }); },
          width: 640, height: 480,
        });
        camera.start();
      } else { setTimeout(startCamera, 250); }
    };
    startCamera();
    return () => { if (camera) camera.stop(); };
  }, [isLoggedIn]);

  const colors = { bg: "#131F24", card: "#202F36", primary: "#58CC02", text: "#FFFFFF", secondary: "#1CB0F6" };

  if (!isLoggedIn) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: colors.bg, color: colors.text, fontFamily: "'Nunito', sans-serif" }}>
        <div style={{ backgroundColor: colors.card, padding: "50px", borderRadius: "24px", textAlign: "center", width: "350px" }}>
          <h1 style={{ color: colors.primary, fontSize: "2.5rem", margin: "0" }}>SignAI</h1>
          <p style={{ color: "#AFAFAF", marginBottom: "30px" }}>Master ASL with AI.</p>
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
            <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} style={{ padding: "15px", borderRadius: "12px", border: "2px solid #37464F", backgroundColor: "#131F24", color: "white" }} />
            <button type="submit" style={{ padding: "15px", backgroundColor: colors.primary, color: "white", borderRadius: "12px", fontWeight: "bold", cursor: "pointer" }}>START</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minHeight: "100vh", backgroundColor: colors.bg, color: colors.text, fontFamily: "'Nunito', sans-serif", padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", maxWidth: "800px", marginBottom: "30px", backgroundColor: colors.card, padding: "15px 30px", borderRadius: "20px" }}>
        <h2 style={{ margin: 0, color: colors.primary }}>SignAI</h2>
        <h3 style={{ margin: 0 }}>⚡ {score} XP</h3>
      </div>
      <div style={{ display: "flex", gap: "15px", marginBottom: "30px" }}>
        <button onClick={() => switchMode("Translate")} style={{ padding: "12px 25px", backgroundColor: mode === "Translate" ? colors.secondary : colors.card, color: "white", border: "none", borderRadius: "12px", fontWeight: "bold" }}>Translate</button>
        <button onClick={() => switchMode("Learn")} style={{ padding: "12px 25px", backgroundColor: mode === "Learn" ? colors.primary : colors.card, color: "white", border: "none", borderRadius: "12px", fontWeight: "bold" }}>Learn</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "40px", width: "100%", maxWidth: "1000px" }}>
        <div style={{ position: "relative", borderRadius: "24px", overflow: "hidden", border: `6px solid ${showSuccess ? colors.primary : colors.card}`, width: "640px", height: "480px" }}>
          <Webcam ref={webcamRef} style={{ width: 640, height: 480, transform: "scaleX(-1)" }} mirrored={true} />
          <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: 640, height: 480, transform: "scaleX(-1)" }} />
          {showSuccess && (
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(88, 204, 2, 0.3)", display: "flex", justifyContent: "center", alignItems: "center" }}>
              <h1 style={{ color: "white", fontSize: "4rem", backgroundColor: colors.primary, padding: "10px 40px", borderRadius: "20px" }}>CORRECT!</h1>
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", backgroundColor: colors.card, padding: "40px", borderRadius: "24px", minWidth: "300px" }}>
          <h3 style={{ margin: "0 0 20px 0", color: "#AFAFAF" }}>{mode === "Translate" ? "I see..." : "Show the sign for"}</h3>
          <p style={{ fontSize: "4rem", fontWeight: "bold", margin: 0, color: mode === "Translate" ? colors.secondary : colors.primary, textAlign: "center" }}>{mode === "Translate" ? gesture : targetSign}</p>
        </div>
      </div>
    </div>
  );
}

export default App;