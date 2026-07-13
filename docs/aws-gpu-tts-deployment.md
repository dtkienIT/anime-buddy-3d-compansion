# AWS GPU TTS Deployment

This runbook prepares VieNeu-TTS on one AWS EC2 GPU instance while keeping the
web and Fastify API on the developer machine. It is intentionally designed for
an AWS Free Plan account: no paid-plan upgrade, no load balancer, no domain, no
Elastic IP, and no public TTS port.

The EC2 quota request for `Running On-Demand G and VT instances` is external to
the repository. On 2026-07-13, AWS rejected the initial Singapore request for 4
vCPUs and invited a detailed appeal. The files in `deploy/aws/tts/` are prepared
but have not been executed on an AWS instance. Deployment remains blocked until
AWS approves a new or reopened request.

## Cost and account safety

- Remain on **Free Plan**. Do not click **Upgrade plan**.
- A quota request is free and does not launch an instance.
- Launch only after the Singapore G/VT quota shows an applied value of at least
  `4`.
- If the launch screen requires a paid-plan upgrade, cancel the launch.
- Use only one `g4dn.xlarge`, and stop it immediately after testing.
- Stopping ends compute usage, but the EBS volume and public IPv4 allocation can
  continue consuming credits. Terminate the instance and delete its volume when
  it is no longer needed.
- AWS Budgets is useful as a warning but is not a real-time hard spending cap.

## Architecture

```text
Browser -> local Fastify API -> 127.0.0.1:8001
                                  |
                                  | SSH tunnel over port 22
                                  v
EC2 127.0.0.1:8000 -> VieNeu ONNX -> NVIDIA T4
```

Port `8000` is never added to the EC2 security group. The service also supports
an optional bearer token as a second layer of protection.

## 1. Wait for quota approval

In region **Asia Pacific (Singapore)**, open:

1. Service Quotas.
2. Amazon Elastic Compute Cloud (Amazon EC2).
3. `Running On-Demand G and VT instances`.

Continue only when **Applied account-level quota value** is at least `4`.
`Case Opened` means AWS is still reviewing the request. A rejected case must be
reopened with a detailed, truthful development use case before checking again.

## 2. Launch the instance

In EC2, choose **Launch instance** and use:

- Name: `anime-buddy-tts`.
- Region: Singapore (`ap-southeast-1`).
- AMI: an AWS Deep Learning GPU AMI based on Ubuntu 22.04 with NVIDIA drivers.
  AMI display names change over time; prefer a current AWS-published Deep
  Learning Base OSS NVIDIA Driver GPU AMI or GPU PyTorch DLAMI.
- Instance type: `g4dn.xlarge` (4 vCPU, NVIDIA T4 16 GB).
- Storage: 50 GiB gp3.
- Key pair: RSA `.pem`, stored only on the developer machine.
- Auto-assign public IP: enabled for the temporary SSH connection.

Security group inbound rules:

| Port | Source | Purpose |
| --- | --- | --- |
| TCP 22 | My IP only | SSH and the TTS tunnel |

Do not add ports `8000`, `80`, or `443`. Enable **Delete on termination** for the
root EBS volume.

## 3. Connect and copy the repository

Use EC2 Instance Connect or SSH. A typical SSH command from PowerShell is:

```powershell
ssh -i "$HOME\Downloads\anime-buddy-tts.pem" ubuntu@PUBLIC_IP
```

On the instance, first verify the driver:

```bash
nvidia-smi
```

Then copy or clone the repository. The following runbook assumes it is at
`/home/ubuntu/anime-buddy-3d-viewer`:

```bash
cd /home/ubuntu/anime-buddy-3d-viewer
```

Never upload the local `.env`, Mistral key, Supabase secret, AWS credentials, or
the EC2 `.pem` key. This machine needs only the TTS source and model downloads.

## 4. Install VieNeu GPU TTS

Generate a private service token and run the installer:

```bash
cd /home/ubuntu/anime-buddy-3d-viewer
export TTS_API_TOKEN="$(openssl rand -hex 32)"
bash deploy/aws/tts/install.sh "$PWD"
unset TTS_API_TOKEN
```

The installer:

- verifies that `nvidia-smi` works;
- installs Python 3.11 through `uv`;
- installs VieNeu and `onnxruntime-gpu`;
- refuses to continue unless ONNX exposes `CUDAExecutionProvider`;
- stores models and WAV cache under `/var/lib/anime-buddy-tts`;
- writes a root-readable-only `/etc/anime-buddy-tts.env`;
- installs and starts `anime-buddy-tts.service` on `127.0.0.1:8000`.

The first startup downloads the VieNeu model from Hugging Face and performs a
warm-up inference. This can take several minutes. Follow it with:

```bash
sudo journalctl -u anime-buddy-tts.service -f
```

Press `Ctrl+C` to stop following logs; this does not stop the service.

Verify GPU and health after warm-up:

```bash
bash deploy/aws/tts/verify-gpu.sh "$PWD"
```

The output must contain `CUDAExecutionProvider` and health should eventually
show `"status":"ok"`.

## 5. Copy the token to the local API

On EC2, display the token only when ready to copy it:

```bash
sudo sed -n 's/^TTS_API_TOKEN=//p' /etc/anime-buddy-tts.env
```

Place it in the repository-root `.env` on the Windows development machine:

```dotenv
TTS_SERVICE_URL=http://127.0.0.1:8001
TTS_SERVICE_TOKEN=paste_the_ec2_token_here
```

Do not add this token to any `VITE_` variable and do not commit `.env`.

## 6. Start the SSH tunnel

Keep this PowerShell window open:

```powershell
ssh -i "$HOME\Downloads\anime-buddy-tts.pem" `
  -N `
  -L 8001:127.0.0.1:8000 `
  -o ServerAliveInterval=30 `
  ubuntu@PUBLIC_IP
```

Start only the local web and API in two other terminals:

```powershell
npm run dev:web
```

```powershell
npm run dev:api
```

Do not run `npm run dev` in this mode because it also starts the local CPU TTS.

Check the tunnel through the local API:

```powershell
Invoke-RestMethod http://127.0.0.1:3002/health
```

The API health result should report that TTS is reachable. Open
`http://127.0.0.1:3001`, send one short uncached message, and then test the long
Vietnamese story used by the browser audio probe.

## 7. Stop safely

After the test:

1. Stop the local API and web terminals.
2. Stop the SSH tunnel with `Ctrl+C`.
3. In EC2, select `anime-buddy-tts` and choose **Instance state > Stop
   instance**.
4. Confirm the state is `Stopped`.

After a stop/start cycle, the public IP can change. Use the new IP in the SSH
tunnel command. The systemd TTS service starts automatically when the instance
boots.

If testing is complete, choose **Terminate instance** and verify that its EBS
volume is deleted. Termination is irreversible, but it is the cleanest way to
stop all instance-related credit usage.

## Troubleshooting

### Quota remains pending

There is no supported quota bypass. Do not upgrade the account only to attempt
to accelerate review. Continue preparing locally and wait for AWS to update the
support case.

### `CUDAExecutionProvider` is missing

Do not start in CPU fallback mode on the paid GPU instance. Confirm the AMI has
working NVIDIA drivers with `nvidia-smi`, rerun the installer, and inspect the
provider list. The installer intentionally fails instead of silently using CPU.

### API health reports TTS unavailable

Check, in order:

1. The SSH tunnel terminal is still connected.
2. Local `.env` uses port `8001`.
3. `TTS_SERVICE_TOKEN` matches the EC2 `TTS_API_TOKEN`.
4. `sudo systemctl status anime-buddy-tts.service` is active.
5. `sudo journalctl -u anime-buddy-tts.service -n 100 --no-pager` has no model
   load error.

### HTTP 401

The tunnel works, but the bearer token does not match. Copy the token again from
`/etc/anime-buddy-tts.env` into local `TTS_SERVICE_TOKEN` and restart the Fastify
API.
