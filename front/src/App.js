import React, { useRef, useState } from "react";
import { Stage, Layer, Text } from "react-konva";
import MathRenderer from "./utils/latexRenderer";
import "./App.css";

function App() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [commands, setCommands] = useState([]);
  const [equations, setEquations] = useState([]);
  const [stageOffset, setStageOffset] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);
  const stageRef = useRef();

  const handleStageTransform = () => {
    const stage = stageRef.current;
    if (stage) {
      setStageOffset({ x: stage.x(), y: stage.y() });
      setStageScale(stage.scaleX());
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError('');
    setCommands([]);
    setEquations([]);
    try { // local : http://localhost:3000
      const response = await fetch('https://h8rwqbnc-3000.inc1.devtunnels.ms/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      if (data.commands) {
        for (let i = 0; i < data.commands.length; i++) {
          await new Promise(resolve => setTimeout(resolve, 800));
          const command = data.commands[i];
          if (command.type === 'equation') {
            setEquations(prev => [
              ...prev,
              {
                id: `eq-${i}`,
                latex: command.latex || command.text,
                x: command.x,
                y: command.y,
                fontSize: command.fontSize || 20
              }
            ]);
          } else {
            setCommands(prev => [...prev, command]);
          }
        }
      } else if (typeof data === 'string') {
        setCommands([{ type: 'text', text: data, x: 20, y: 20, fontSize: 16 }]);
      } else {
        setError('Unexpected response format');
      }
    } catch (err) {
      setError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const clearCanvas = () => {
    setCommands([]);
    setEquations([]);
    setError('');
  };

  // --- TTS Handler ---
  const handleSpeak = () => {
    if (!window.speechSynthesis) {
      alert("Speech synthesis not supported in this browser.");
      return;
    }

    let textToSpeak = "";

    // Add normal text
    commands.forEach(cmd => {
      if (cmd.type === "text") {
        textToSpeak += cmd.text + ". ";
      }
    });

    // Add equations (read LaTeX as words)
    equations.forEach(eq => {
      textToSpeak += "Equation: " + eq.latex.replace(/\\/g, " ") + ". ";
    });

    if (!textToSpeak.trim()) {
      alert("Nothing on the board to speak.");
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new window.SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = "en-US";
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.name.toLowerCase().includes("female")) 
                   || voices.find(v => v.lang === "en-US");
    if (preferred) utterance.voice = preferred;

    window.speechSynthesis.speak(utterance);
  };
  // --- End TTS Handler ---

  return (
    <div className="App">
      <header className="App-header">
        <h1>AI Teacher Whiteboard</h1>
        <p>Ask me to explain any concept and I'll draw it on the whiteboard!</p>
      </header>
      
      <div className="controls">
        <div className="input-group">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask me to explain something... (e.g., 'Explain Taylor series')"
            className="prompt-input"
            onKeyPress={(e) => e.key === 'Enter' && handleGenerate()}
          />
          <button 
            onClick={handleGenerate} 
            disabled={loading || !prompt.trim()}
            className="generate-btn"
          >
            {loading ? 'Generating...' : 'Generate'}
          </button>
          <button onClick={clearCanvas} className="clear-btn">
            Clear
          </button>
          <button onClick={handleSpeak} className="speak-btn">
            🔊 Speak
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="whiteboard-container">
        <Stage
          ref={stageRef}
          width={window.innerWidth}
          height={window.innerHeight}
          draggable
          onDragMove={handleStageTransform}
          style={{ background: "#fff" }}
        >
          <Layer>
            {commands.map((cmd, idx) => {
              if (cmd.type === 'text') {
                return (
                  <Text
                    key={idx}
                    text={cmd.text}
                    x={cmd.x}
                    y={cmd.y}
                    fontSize={cmd.fontSize || 24}
                    fill={cmd.color || 'black'}
                    align="center"
                    fontFamily="Arial, sans-serif"
                    lineHeight={1.4}
                    draggable={false}
                    listening={false}
                  />
                );
              }
              return null;
            })}

            {loading && commands.length > 0 && (
              <Text
                x={20}
                y={780}
                text="⏳ Generating more content..."
                fontSize={14}
                fill="#666"
                fontStyle="italic"
                draggable={false}
                listening={false}
              />
            )}
          </Layer>
        </Stage>
        
        <div
          id="html-layer"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "1200px",
            height: "800px",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          {equations.map((eq, idx) => (
            <MathRenderer
              key={eq.id || idx}
              latex={eq.latex}
              x={eq.x + stageOffset.x}
              y={eq.y + stageOffset.y}
              fontSize={eq.fontSize || 24}
              scale={stageScale}
            />
          ))}
        </div>
        
        {commands.length === 0 && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: '24px',
            color: '#666',
            pointerEvents: 'none'
          }}>
            {loading ? (
              <div style={{ textAlign: 'center' }}>
                <div>Generating content...</div>
                <div style={{ fontSize: '16px', marginTop: '10px', color: '#999' }}>
                  Drawing will appear here as it's generated
                </div>
              </div>
            ) : (
              'Enter a prompt and click Generate to see drawings here'
            )}
          </div>
        )}
      </div>

      <div className="info">
        <p>
          <strong>Examples:</strong> "Explain Taylor series", "Draw a neural network", 
          "Show the water cycle", "Explain photosynthesis"
        </p>
      </div>
    </div>
  );
}

export default App;
