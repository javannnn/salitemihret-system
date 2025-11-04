API=app.main:app
PORT?=8001

.PHONY: dev seed resetdb login

dev:
	uvicorn $(API) --reload --host 0.0.0.0 --port $(PORT)

seed:
	PYTHONPATH=$(PWD) python -m app.scripts.seed_demo

resetdb:
	sudo -u postgres psql -c "DROP DATABASE IF EXISTS saliteone WITH (FORCE);"
	sudo -u postgres createdb -O salite saliteone
	alembic upgrade head

login:
	curl -s -X POST http://localhost:8001/auth/login \
	  -H "Content-Type: application/json" \
	  -d '{"email":"pradmin@example.com","password":"Demo123!"}'
