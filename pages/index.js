import React from 'react';

export default function Home() {
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial' }}>
      <h1>Fulcrum Rev Application</h1>
      <p>Your development environment is working!</p>
      <button onClick={() => alert('Button works!')}>Click Me</button>
    </div>
  );
}
