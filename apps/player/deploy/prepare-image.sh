#!/usr/bin/env bash
# Подготовка «золотого» образа Ubuntu Server для бортового компьютера.
# Прогоняется один раз на эталонной машине, дальше образ клонируется на остальные борта;
# на каждом борту после клонирования остаётся только вписать PLAYER_DEVICE_ID/TOKEN в /etc/bus-player/player.env.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }

# 1. Базовые пакеты + плеер
"$(dirname "$0")/install.sh"

# 2. Если это оказался Ubuntu Desktop — убираем графическую сессию, иначе GDM/Wayland мешают киоску
systemctl list-unit-files | grep -q '^gdm' && systemctl disable --now gdm || true
systemctl set-default multi-user.target

# 3. Автологин не нужен: bus-player.service сам поднимает X от пользователя bus
# 4. Модем Quectel EC25: ModemManager держит данные, gpsd — NMEA. Чтобы MM не захватывал GPS-порт:
cat > /etc/udev/rules.d/99-ec25-gps.rules <<'U'
# ttyUSB1 у EC25 — NMEA-порт; прячем его от ModemManager
SUBSYSTEM=="tty", ATTRS{idVendor}=="2c7c", ATTRS{idProduct}=="0125", ENV{ID_MM_PORT_IGNORE}="1", KERNEL=="ttyUSB1"
U
udevadm control --reload

# 5. 4G через ModemManager/NetworkManager (APN уточнить у оператора)
apt-get install -y modemmanager network-manager
nmcli con add type gsm ifname '*' con-name lte apn internet 2>/dev/null || true
nmcli con mod lte connection.autoconnect yes connection.autoconnect-retries 0 || true

# 6. Защита от «умирания» по питанию: fsck при каждой загрузке, journald не растёт
sed -i 's/^#\?MaxUse=.*/MaxUse=200M/' /etc/systemd/journald.conf
sed -i 's/^#\?ForwardToSyslog=.*/ForwardToSyslog=no/' /etc/systemd/journald.conf
# 7. Watchdog: если плеер не отвечает 5 минут — перезапуск сервиса (hardware watchdog настраивается отдельно)
mkdir -p /etc/systemd/system/bus-player.service.d
cat > /etc/systemd/system/bus-player.service.d/watchdog.conf <<'W'
[Service]
# systemd перезапустит сервис, если лог не обновлялся 5 минут (проверка в cron ниже)
W
cat > /etc/cron.d/bus-player-watchdog <<'C'
*/5 * * * * root test -n "$(find /var/log/bus-player.log -mmin -5 2>/dev/null)" || systemctl restart bus-player
C
systemctl daemon-reload

# 8. Чистим идентификаторы перед клонированием образа
rm -f /etc/bus-player/player.env; cp "$(dirname "$0")/player.env.example" /etc/bus-player/player.env
truncate -s0 /etc/machine-id; rm -f /var/lib/dbus/machine-id
echo "Образ готов. Выключи машину и снимай образ диска. На каждом борту: впиши PLAYER_DEVICE_ID/TOKEN и перезагрузи."
