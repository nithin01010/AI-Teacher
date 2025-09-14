import React from 'react';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>AI Teacher Whiteboard - Test</h1>
        <p>If you can see this, React is working!</p>
      </header>
      
      <div className="controls">
        <div className="input-group">
          <input
            type="text"
            placeholder="Test input field"
            className="prompt-input"
          />
          <button className="generate-btn">
            Test Button
          </button>
        </div>
      </div>

      <div className="whiteboard-container">
        <div style={{ 
          width: '1200px', 
          height: '800px', 
          border: '2px solid #ccc', 
          background: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px',
          color: '#666'
        }}>
          Test Whiteboard Area
        </div>
      </div>
    </div>
  );
}

export default App;
