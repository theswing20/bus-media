#!/usr/bin/env bash
# Установка плеера на бортовой компьютер (Debian/Ubuntu/Raspberry Pi OS, X11).
# Запускать от root. Предполагается, что .deb уже собран (pnpm package:linux) и лежит рядом.
set -euo pipefail

apt-get update
apt-get install -y gpsd gpsd-clients xserver-xorg xinit openbox unclutter pulseaudio alsa-utils x11-xserver-utils

# Пользователь-киоск
id -u bus &>/dev/null || useradd -m -G audio,video,dialout bus

# gpsd: модем Quectel EC25 отдаёт NMEA обычно на /dev/ttyUSB1 (проверить: ls /dev/ttyUSB*)
cat > /etc/default/gpsd <<'G'
START_DAEMON="true"
USBAUTO="false"
DEVICES="/dev/ttyUSB1"
GPSD_OPTIONS="-n"
G
systemctl enable --now gpsd

# Плеер
dpkg -i ./busplayer_*.deb || apt-get install -f -y
mkdir -p /etc/bus-player
[ -f /etc/bus-player/player.env ] || cp ./player.env.example /etc/bus-player/player.env
chown -R bus:bus /etc/bus-player

install -m 755 ./xinitrc /home/bus/.xinitrc
install -m 644 ./bus-player.service /etc/systemd/system/bus-player.service
systemctl daemon-reload
systemctl enable bus-player
echo "Готово. Впишите PLAYER_DEVICE_ID/PLAYER_DEVICE_TOKEN в /etc/bus-player/player.env и: systemctl start bus-player"
