import React, { useState } from 'react'

export default function App() {
  const [count, setCount] = useState(0)
  return (
    <div style={{ textAlign:'center', marginTop:100 }}>
      <h1>🧮 카운터 앱</h1>
      <h2 style={{ fontSize:48 }}>{count}</h2>
      <button onClick={() => setCount(c => c + 1)}>+ 1 증가</button>
    </div>
  )
}
