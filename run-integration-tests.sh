#!/bin/bash

export TMP_TEST=`mktemp -d -t portal.XXXXX`
cp -R ../portal-api/test/test-config/* $TMP_TEST
echo Temp dir: $TMP_TEST

export NODE_ENV=test
# echo $TMP_TEST
export PORTAL_API_STATIC_CONFIG=$TMP_TEST/static
export PORTAL_API_DYNAMIC_CONFIG=$TMP_TEST/dynamic
export PORTAL_URL=http://localhost:3000
export PORTAL_API_URL=http://localhost:3001
export PORTAL_PORTAL_URL=http://localhost:3000
export PORTAL_KONG_ADAPTER_URL=http://localhost:3002
export PORTAL_KONG_ADMIN_URL=http://localhost:8001
export PORTAL_MAILER_URL=http://localhost:3003
export PORTAL_CHATBOT_URL=http://localhost:3004
export PORTAL_API_AESKEY=ThisIsASecretSauceKeyWhichDoesNotMatterForTheUnitTests
# Speed up intervals for unit testing
export PORTAL_API_HOOK_INTERVAL=10000
export PORTAL_CONFIG_KEY=ThisDoesNotMatterEither

echo Starting API

DEBUG=portal-api:* node ../portal-api/bin/api &> $TEST_RESULTS./portal_test_api.log &

export TEST_API_PID=$!

# node ../portal-env/await.js $PORTAL_API_URL/ping

echo Starting Portal

# DEBUG=portal-env:*,portal:* node bin/www &> unit_test_portal.log &
DEBUG=portal-env:*,portal:* istanbul cover --handle-sigint bin/www &> $TEST_RESULTS./portal_test_portal.log &

export TEST_PORTAL_PID=$!

node ../portal-env/await.js $PORTAL_URL/ping

echo 
echo Integration Testing Portal

mocha || echo Failed > $TEST_RESULTS./integration_tests_portal.failed

kill -2 $TEST_PORTAL_PID
sleep 1
kill $TEST_API_PID

echo $TMP_TEST
rm -rf $TMP_TEST
