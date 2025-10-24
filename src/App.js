import React, { useState } from 'react';

function App() {
  const [count, setCount] = useState(0);

  const increase = () => setCount(count + 1);
  const decrease = () => setCount(count - 1);
  const reset = () => setCount(0);

  return (
    <div style={{
      textAlign: 'center',
      marginTop: '100px',
      color: '#333',
      fontFamily: 'sans-serif'
    }}>
      <h1>🧮 카운터 앱</h1>
      <h2 style={{ fontSize: '48px', margin: '20px' }}>{count}</h2>
      <div>
        <button
          onClick={decrease}
          style={{ margin: '5px', padding: '10px 20px', fontSize: '18px' }}
        >
          - 1 감소
        </button>
        <button
          onClick={reset}
          style={{ margin: '5px', padding: '10px 20px', fontSize: '18px' }}
        >
          🔁 리셋
        </button>
        <button
          onClick={increase}
          style={{ margin: '5px', padding: '10px 20px', fontSize: '18px' }}
        >
          + 1 증가
        </button>
      </div>
    </div>
  );
}

export default App;
