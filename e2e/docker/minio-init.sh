#!/bin/sh
# Un par de buckets por consumidor: ninguna prueba ve los objetos de otra.
set -e
until mc alias set local http://minio:9000 minioadmin minioadmin >/dev/null 2>&1; do sleep 1; done
for bucket in queued-storage queued-public inline-storage inline-public integration-storage integration-public; do
	mc mb -p "local/$bucket"
done
