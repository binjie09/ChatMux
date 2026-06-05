package com.chatmux.app;

import android.content.Context;

import java.io.File;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.Arrays;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicReference;

final class GatewayProcess {
    private static final String GATEWAY_BINARY = "libchatmux_gateway.so";
    private static final String GATEWAY_HOST = "127.0.0.1";
    private static final String GATEWAY_PORT = "19327";
    private static final int READY_TIMEOUT_MS = 5000;
    private static final int READY_POLL_MS = 100;
    private static final int CONNECT_TIMEOUT_MS = 100;

    private final Context context;
    private ExecutorService executor;
    private Process process;

    GatewayProcess(Context context) {
        this.context = context.getApplicationContext();
    }

    void start() {
        executor = Executors.newSingleThreadExecutor();
        AtomicReference<Process> spawnedProcess = new AtomicReference<>();
        Future<Process> future = executor.submit(() -> launch(spawnedProcess));
        process = waitForStartedProcess(future, spawnedProcess);
    }

    void stop() {
        destroyProcess(process);
        if (executor != null) {
            executor.shutdownNow();
        }
    }

    private Process waitForStartedProcess(Future<Process> future, AtomicReference<Process> spawnedProcess) {
        try {
            return future.get(READY_TIMEOUT_MS + 1000L, TimeUnit.MILLISECONDS);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while starting bundled gateway", error);
        } catch (ExecutionException error) {
            throw new IllegalStateException("Failed to start bundled gateway", error.getCause());
        } catch (TimeoutException error) {
            destroyProcess(spawnedProcess.get());
            future.cancel(true);
            throw new IllegalStateException("Timed out while starting bundled gateway", error);
        }
    }

    private Process launch(AtomicReference<Process> spawnedProcess) throws IOException, InterruptedException {
        if (portReady()) {
            throw new IOException("Gateway port is already in use before bundled gateway start");
        }
        Process nextProcess = spawn();
        spawnedProcess.set(nextProcess);
        waitUntilReady(nextProcess);
        return nextProcess;
    }

    private Process spawn() throws IOException {
        File binary = gatewayBinaryFile();
        File logFile = new File(context.getFilesDir(), "chatmux-gateway.log");
        ProcessBuilder builder = new ProcessBuilder(binary.getAbsolutePath());
        applyEnvironment(builder.environment());
        builder.redirectErrorStream(true);
        builder.redirectOutput(ProcessBuilder.Redirect.appendTo(logFile));
        return builder.start();
    }

    private File gatewayBinaryFile() throws IOException {
        File binary = new File(context.getApplicationInfo().nativeLibraryDir, GATEWAY_BINARY);
        if (!binary.isFile()) {
            throw new IOException("Bundled gateway binary missing for ABIs " + Arrays.toString(android.os.Build.SUPPORTED_ABIS));
        }
        return binary;
    }

    private void applyEnvironment(Map<String, String> environment) {
        File dbFile = new File(context.getFilesDir(), "chatmux.db");
        environment.put("CHATMUX_ADDR", GATEWAY_HOST + ":" + GATEWAY_PORT);
        environment.put("CHATMUX_DB", dbFile.getAbsolutePath());
        environment.put("CHATMUX_LOCAL_NO_AUTH", "1");
    }

    private static void waitUntilReady(Process process) throws IOException, InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(READY_TIMEOUT_MS);
        while (System.nanoTime() < deadline) {
            ensureAlive(process);
            if (portReady()) {
                return;
            }
            Thread.sleep(READY_POLL_MS);
        }
        throw new IOException("Bundled gateway did not start listening on time");
    }

    private static void ensureAlive(Process process) throws IOException {
        try {
            int exitCode = process.exitValue();
            throw new IOException("Bundled gateway exited before listening with code " + exitCode);
        } catch (IllegalThreadStateException running) {
            return;
        }
    }

    private static boolean portReady() {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(GATEWAY_HOST, Integer.parseInt(GATEWAY_PORT)), CONNECT_TIMEOUT_MS);
            return true;
        } catch (IOException error) {
            return false;
        }
    }

    private static void destroyProcess(Process process) {
        if (process != null) {
            process.destroy();
        }
    }
}
