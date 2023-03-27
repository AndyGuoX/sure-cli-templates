import React, { useState } from 'react';
import { Button } from 'antd';

const HelloWorld = () => {
  const [count, setCount] = useState(0);

  const addCount = () => {
    setCount(count + 1);
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <p>{count}</p>
      <Button type="primary" onClick={addCount}>
        点我+1
      </Button>
    </div>
  );
};

export default HelloWorld;
