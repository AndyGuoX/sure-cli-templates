import React from 'react';
import { ConfigProvider } from 'antd';
import { HelloWorld } from '@/components';

const App = () => {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#ff704f'
        }
      }}
    >
      <HelloWorld />
    </ConfigProvider>
  );
};

export default App;
