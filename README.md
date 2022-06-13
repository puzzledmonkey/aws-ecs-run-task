# AWS ECS Run Task

Runs a one-off task on AWS ECS Fargate.

Usage
``` yaml
- name: Run migration
  uses: noelzubin/aws-ecs-run-task@v1.0
  with:
    cluster: staging
    service: service

- name: Run more Migrations
  uses: noelzubin/aws-ecs-run-task@v1.0
  with:
    cluster: staging
    service: service
    override-container: server
    override-container-command: |
        sh
        -c
        cd database && python migrate.py
```

See [action.yml](action.yml) file for the full documentation of this action's inputs and outputs.

## Credentials and Region

This action relies on the [default behavior of the AWS SDK for Javascript](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-credentials-node.html) to determine AWS credentials and region.
Use [the `aws-actions/configure-aws-credentials` action](https://github.com/aws-actions/configure-aws-credentials) to configure the GitHub Actions environment with environment variables containing AWS credentials and your desired region.

## License Summary

This code is made available under the MIT license.
