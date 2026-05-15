#!/usr/bin/env python3
"""
Automatically add organization_id scoping to Prisma queries in controller files.
"""

import re
from pathlib import Path

def add_org_scoping(content: str, model_name: str) -> str:
    """Add organization_id to Prisma queries for a specific model."""

    def repl_find_many(m):
        prefix = m.group(1)
        inner = m.group(2)
        if 'organization_id' in inner:
            return m.group(0)
        if re.search(r'\bwhere\s*:', inner):
            inner = re.sub(r'(where\s*:\s*\{)', r'\1\n                organization_id: req.user!.organization_id,', inner, count=1)
        else:
            inner = 'where: {\n                organization_id: req.user!.organization_id,\n            },\n            ' + inner
        return f'{prefix}findMany({{\n            {inner}}})'

    def repl_find_unique(m):
        prefix = m.group(1)
        inner = m.group(2)
        if 'organization_id' in inner:
            return m.group(0)
        inner = re.sub(r'(where\s*:\s*\{)', r'\1\n                organization_id: req.user!.organization_id,', inner, count=1)
        return f'{prefix}findFirst({{\n            {inner}}})'

    def repl_create(m):
        prefix = m.group(1)
        inner = m.group(2)
        if 'organization_id' in inner:
            return m.group(0)
        inner = re.sub(r'(data\s*:\s*\{)', r'\1\n                organization_id: req.user!.organization_id,', inner, count=1)
        return f'{prefix}create({{\n            {inner}}})'

    def repl_update(m):
        prefix = m.group(1)
        inner = m.group(2)
        if 'organization_id' in inner:
            return m.group(0)
        inner = re.sub(r'(where\s*:\s*\{)', r'\1\n                organization_id: req.user!.organization_id,', inner, count=1)
        return f'{prefix}update({{\n            {inner}}})'

    def repl_delete(m):
        prefix = m.group(1)
        inner = m.group(2)
        if 'organization_id' in inner:
            return m.group(0)
        inner = re.sub(r'(where\s*:\s*\{)', r'\1\n                organization_id: req.user!.organization_id,', inner, count=1)
        return f'{prefix}delete({{\n            {inner}}})'

    def repl_upsert(m):
        prefix = m.group(1)
        inner = m.group(2)
        if 'organization_id' in inner:
            return m.group(0)
        inner = re.sub(r'(where\s*:\s*\{)', r'\1\n                organization_id: req.user!.organization_id,', inner, count=1)
        inner = re.sub(r'(create\s*:\s*\{)(?!.*?organization_id)', r'\1\n                organization_id: req.user!.organization_id,', inner, count=1)
        inner = re.sub(r'(update\s*:\s*\{)(?!.*?organization_id)', r'\1\n                organization_id: req.user!.organization_id,', inner, count=1)
        return f'{prefix}upsert({{\n            {inner}}})'

    content = re.sub(rf'(prisma\.{model_name}\.)findMany\(\{{([\s\S]*?)\}}\)', repl_find_many, content)
    content = re.sub(rf'(prisma\.{model_name}\.)findUnique\(\{{([\s\S]*?)\}}\)', repl_find_unique, content)
    content = re.sub(rf'(prisma\.{model_name}\.)create\(\{{([\s\S]*?)\}}\)', repl_create, content)
    content = re.sub(rf'(prisma\.{model_name}\.)update\(\{{([\s\S]*?)\}}\)', repl_update, content)
    content = re.sub(rf'(prisma\.{model_name}\.)delete\(\{{([\s\S]*?)\}}\)', repl_delete, content)
    content = re.sub(rf'(prisma\.{model_name}\.)upsert\(\{{([\s\S]*?)\}}\)', repl_upsert, content)

    return content


def process_file(filepath: Path, models: list[str]) -> None:
    content = filepath.read_text()
    original = content
    for model in models:
        content = add_org_scoping(content, model)
    if content != original:
        filepath.write_text(content)
        print(f"Updated: {filepath}")
    else:
        print(f"No changes: {filepath}")


def main():
    controllers_dir = Path('/Users/ocheme/Desktop/WebForx/Projects/time-tracker/backend/src/controllers')

    mappings = {
        'userController.ts': ['user', 'role', 'projectMember', 'passwordResetToken'],
        'timeEntryController.ts': ['timeEntry', 'activeTimer', 'timerCorrectionRequest', 'notification', 'auditLog', 'timeEntryTag'],
        'reportController.ts': ['timeEntry', 'project', 'user', 'reportCache'],
        'calendarController.ts': ['calendarConnection', 'user'],
        'cronController.ts': ['activeTimer', 'timeEntry', 'notification', 'user', 'timerPolicyConfig', 'scheduledReport'],
        'contactController.ts': ['accessRequest'],
    }

    for filename, models in mappings.items():
        filepath = controllers_dir / filename
        if filepath.exists():
            process_file(filepath, models)
        else:
            print(f"Missing: {filepath}")


if __name__ == '__main__':
    main()
