package com.chatmux.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private GatewayProcess gateway;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        gateway = new GatewayProcess(this);
        gateway.start();
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onDestroy() {
        if (gateway != null) {
            gateway.stop();
        }
        super.onDestroy();
    }
}
