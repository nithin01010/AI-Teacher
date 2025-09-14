import React, { useState, useRef } from 'react';
import { Stage, Layer, Text, Line, Rect, Group, Image as KonvaImage } from 'react-konva';
import { renderLatexToCanvas, detectLatex } from './utils/latexRenderer';
import './App.css';

// Add error boundary
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: 'red' }}>
          <h2>Something went wrong.</h2>
          <p>Error: {this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [commands, setCommands] = useState([]);
  const [error, setError] = useState('');
  const stageRef = useRef();

  // Streaming response handler
  const fetchStreamingResponse = async (prompt, onCommand) => {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });

      // Process chunks line by line
      let parts = buffer.split('\n');
      buffer = parts.pop();
      
      for (const part of parts) {
        if (part.trim()) {
          try {
            if (part.startsWith('data: ')) {
              const data = part.substring(6);
              if (data === '[DONE]') break;
              
              const command = JSON.parse(data);
              onCommand(command);
            }
          } catch (e) {
            console.warn('Failed to parse streaming data:', part);
          }
        }
      }
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    
    setLoading(true);
    setError('');
    setCommands([]);
    
    try {
      await fetchStreamingResponse(prompt, (command) => {
        setCommands(prev => [...prev, command]);
      });
    } catch (err) {
      setError(`Error: ${err.message}`);
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const clearCanvas = () => {
    setCommands([]);
    setError('');
  };

  const renderCommand = (command, index) => {
    const key = `${command.type}-${index}`;
    
    switch (command.type) {
      case 'text':
        // Check if text contains LaTeX expressions
        const latexMatches = detectLatex(command.text);
        if (latexMatches.length > 0) {
          // Split text and render LaTeX parts separately
          return <MixedTextRenderer 
            key={key}
            text={command.text}
            x={command.x || 20}
            y={command.y}
            fontSize={command.fontSize || 16}
            latexMatches={latexMatches}
          />;
        }
        
        return (
          <Text
            key={key}
            x={command.x || 20}
            y={command.y}
            text={command.text}
            fontSize={command.fontSize || 16}
            fill="#000"
            fontFamily="Arial"
            align="left"
          />
        );
      
      case 'equation':
        // Use KaTeX for equation rendering
        return <EquationRenderer 
          key={key} 
          latex={command.latex || command.text} 
          x={command.x} 
          y={command.y} 
          fontSize={command.fontSize || 18}
        />;
      
      case 'line':
        return (
          <Line
            key={key}
            points={command.points}
            stroke="#000"
            strokeWidth={command.strokeWidth || 2}
            lineCap="round"
            lineJoin="round"
          />
        );
      
      case 'rect':
        return (
          <Rect
            key={key}
            x={command.x}
            y={command.y}
            width={command.width}
            height={command.height}
            stroke="#000"
            strokeWidth={2}
            fill="transparent"
          />
        );
      
      case 'group':
        return (
          <Group key={key} x={command.x} y={command.y}>
            {command.children && command.children.map((child, childIndex) => 
              renderCommand(child, `${index}-${childIndex}`)
            )}
          </Group>
        );
      
      default:
        return null;
    }
  };

  // Component for rendering mixed text with LaTeX
  const MixedTextRenderer = ({ text, x, y, fontSize, latexMatches }) => {
    const [renderedParts, setRenderedParts] = useState([]);

    React.useEffect(() => {
      const parts = [];
      let lastIndex = 0;
      let currentXPos = x;

      latexMatches.forEach((match, index) => {
        // Add text before LaTeX
        if (match.start > lastIndex) {
          const textPart = text.substring(lastIndex, match.start);
          if (textPart.trim()) {
            parts.push({
              type: 'text',
              content: textPart,
              x: currentXPos,
              y: y,
              fontSize: fontSize
            });
            currentXPos += textPart.length * fontSize * 0.6; // Approximate width
          }
        }

        // Add LaTeX part
        parts.push({
          type: 'latex',
          content: match.latex,
          x: currentXPos,
          y: y,
          fontSize: fontSize
        });
        currentXPos += 100; // Approximate LaTeX width

        lastIndex = match.end;
      });

      // Add remaining text
      if (lastIndex < text.length) {
        const remainingText = text.substring(lastIndex);
        if (remainingText.trim()) {
          parts.push({
            type: 'text',
            content: remainingText,
            x: currentXPos,
            y: y,
            fontSize: fontSize
          });
        }
      }

      setRenderedParts(parts);
    }, [text, x, y, fontSize, latexMatches]);

    return (
      <Group>
        {renderedParts.map((part, index) => {
          if (part.type === 'latex') {
            return (
              <EquationRenderer
                key={`latex-${index}`}
                latex={part.content}
                x={part.x}
                y={part.y}
                fontSize={part.fontSize}
              />
            );
          } else {
            return (
              <Text
                key={`text-${index}`}
                x={part.x}
                y={part.y}
                text={part.content}
                fontSize={part.fontSize}
                fill="#000"
                fontFamily="Arial"
                align="left"
              />
            );
          }
        })}
      </Group>
    );
  };

  // Component for rendering equations with KaTeX
  const EquationRenderer = ({ latex, x, y, fontSize }) => {
    const [imageData, setImageData] = useState(null);
    const [error, setError] = useState(false);

    React.useEffect(() => {
      renderLatexToCanvas(latex, x, y, fontSize)
        .then(result => {
          setImageData(result);
        })
        .catch(err => {
          console.error('KaTeX rendering failed:', err);
          setError(true);
        });
    }, [latex, x, y, fontSize]);

    if (error) {
      // Fallback to plain text if KaTeX fails
      return (
        <Text
          x={x}
          y={y}
          text={latex}
          fontSize={fontSize}
          fill="#000"
          fontFamily="Arial"
          fontStyle="italic"
        />
      );
    }

    if (!imageData) {
      // Loading state
      return (
        <Text
          x={x}
          y={y}
          text="Rendering equation..."
          fontSize={fontSize}
          fill="#666"
          fontFamily="Arial"
        />
      );
    }

    return (
      <KonvaImage
        x={imageData.x}
        y={imageData.y}
        image={imageData.image}
        width={imageData.width * 0.8}
        height={imageData.height * 0.8}
      />
    );
  };

  return (
    <ErrorBoundary>
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
          </div>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="whiteboard-container">
          <Stage 
            width={1200} 
            height={800} 
            ref={stageRef} 
            draggable={true}
            scaleX={1}
            scaleY={1}
          >
            <Layer>
              {commands.map((command, index) => renderCommand(command, index))}
            </Layer>
          </Stage>
        </div>

        <div className="info">
          <p>
            <strong>Examples:</strong> "Explain Taylor series", "Draw a neural network", 
            "Show the water cycle", "Explain photosynthesis"
          </p>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default App;
